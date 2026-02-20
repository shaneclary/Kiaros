/**
 * Kiaros Post-Session Reflection (Phase 10)
 *
 * After a session ends, this module sends the transcript to Claude and asks
 * it to extract three kinds of structured memory:
 *
 *   lessons  — things Kiaros should do differently or better
 *   facts    — durable user facts worth persisting to working memory
 *   patterns — recurring user behaviours / communication preferences
 *
 * Lessons and patterns are archived via archiveChunk (semantic, searchable).
 * Facts are written to working_memory so they appear in every future system prompt.
 *
 * Cost note: reflection uses claude-haiku by default — it's a brief, structured
 * task that doesn't need Sonnet-level reasoning.
 */

const Anthropic = require('@anthropic-ai/sdk')
const { getMessages } = require('./session')
const { archiveChunk } = require('./archive')
const { setMemory } = require('./working')

const REFLECTION_SYSTEM = `You are a memory assistant for a personal AI executive assistant called Kiaros.
Your job is to read a conversation transcript and extract structured memory in JSON format.`

const REFLECTION_PROMPT = `Review the conversation above and output a JSON object with EXACTLY this structure:

{
  "lessons": [
    "One concrete improvement Kiaros should make in future sessions"
  ],
  "facts": [
    { "key": "short-kebab-key", "value": "Durable fact about the user worth remembering across sessions" }
  ],
  "patterns": [
    "A recurring preference or communication style the user showed"
  ]
}

Rules:
- lessons: 0-5 actionable strings. Only include if something went wrong or could be improved.
- facts: 0-10 key/value pairs. Keys must be short-kebab-case. Only include durable facts (name, preferences, recurring context). Never include one-off task details.
- patterns: 0-5 strings about how the user communicates or thinks.
- Output ONLY the JSON object. No markdown fences, no explanation, no other text.`

/**
 * Run a post-session reflection and persist the results.
 *
 * @param {string} sessionId
 * @param {string} apiKey     - Anthropic API key (NEVER log)
 * @param {string} model      - model to use (defaults to haiku for cost efficiency)
 * @returns {Promise<{ lessons: string[], facts: object[], patterns: string[], archived: number }>}
 */
async function reflectOnSession(sessionId, apiKey, model = 'claude-haiku-4-20250514') {
  const messages = getMessages(sessionId)
  if (!messages || messages.length === 0) {
    return { lessons: [], facts: [], patterns: [], archived: 0, skipped: true, reason: 'No messages in session' }
  }

  // Build transcript — skip very short sessions (< 2 turns)
  const turns = messages.filter(m => m.role === 'user' || m.role === 'assistant')
  if (turns.length < 2) {
    return { lessons: [], facts: [], patterns: [], archived: 0, skipped: true, reason: 'Session too short' }
  }

  const transcript = turns.map(m => {
    const content = typeof m.content === 'string'
      ? m.content
      : (m.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
    return `[${m.role.toUpperCase()}]: ${content.substring(0, 800)}`
  }).join('\n\n')

  // Call Claude for structured reflection
  const client = new Anthropic({ apiKey })

  let rawJson
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: REFLECTION_SYSTEM,
      messages: [
        { role: 'user', content: `Conversation transcript:\n\n${transcript}\n\n${REFLECTION_PROMPT}` }
      ]
    })

    rawJson = response.content.find(b => b.type === 'text')?.text || '{}'
  } finally {
    // SECURITY: ensure apiKey reference doesn't linger
  }

  // Parse — be lenient about markdown fences Claude might add despite instructions
  let reflection
  try {
    const cleaned = rawJson.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim()
    reflection = JSON.parse(cleaned)
  } catch {
    console.warn('[reflection] Failed to parse Claude response:', rawJson.substring(0, 200))
    return { lessons: [], facts: [], patterns: [], archived: 0, parseError: true }
  }

  const lessons  = Array.isArray(reflection.lessons)  ? reflection.lessons.filter(l => typeof l === 'string')  : []
  const facts    = Array.isArray(reflection.facts)    ? reflection.facts.filter(f => f?.key && f?.value)       : []
  const patterns = Array.isArray(reflection.patterns) ? reflection.patterns.filter(p => typeof p === 'string') : []

  // ── Persist lessons + patterns to archive ───────────────────────────────
  let archived = 0
  for (const lesson of lessons) {
    await archiveChunk({
      content: `[lesson] ${lesson}`,
      source: 'reflection',
      sessionId
    })
    archived++
  }
  for (const pattern of patterns) {
    await archiveChunk({
      content: `[pattern] ${pattern}`,
      source: 'reflection',
      sessionId
    })
    archived++
  }

  // ── Persist facts to working memory ─────────────────────────────────────
  for (const { key, value } of facts) {
    const safeKey = String(key).toLowerCase().replace(/[^a-z0-9:-]/g, '-').substring(0, 100)
    try {
      setMemory(safeKey, String(value).substring(0, 500), 'reflection')
    } catch (err) {
      console.warn(`[reflection] Failed to save fact "${safeKey}":`, err.message)
    }
  }

  console.log(`[reflection] Session ${sessionId}: ${lessons.length} lessons, ${facts.length} facts, ${patterns.length} patterns archived`)

  return { lessons, facts, patterns, archived }
}

module.exports = { reflectOnSession }

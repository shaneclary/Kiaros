/**
 * Token Budget Manager
 *
 * Provides:
 *  - Local token estimation (4 chars/token heuristic — good enough for budgeting)
 *  - Monthly spend guard: warns before a request would exceed the budget ceiling
 *  - Context compression (two modes):
 *      compressContextWithAI  — sends the old messages to Claude for a real semantic
 *                               summary (async, requires apiKey + model)
 *      compressContext        — local string truncation fallback (sync, zero cost)
 *      ensureContextFits      — calls AI compression when possible, else local
 */

const { getDb } = require('../db/client')

const CHARS_PER_TOKEN = 4           // conservative English estimate
const COMPRESS_ABOVE_TOKENS = 50000 // ~200K chars; well under Claude's 200K limit
const COMPRESS_KEEP_LAST = 8        // always keep this many message pairs

/**
 * Estimate token count for a text string.
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Estimate total tokens across an Anthropic-format messages array.
 * Handles string content, text blocks, tool_use blocks, and tool_result blocks.
 * @param {Array} messages
 * @returns {number}
 */
function estimateContextTokens(messages) {
  let total = 0
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content)
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          total += estimateTokens(block.text || '')
        } else if (block.type === 'tool_use') {
          total += estimateTokens(JSON.stringify(block.input || {}))
        } else if (block.type === 'tool_result') {
          total += estimateTokens(
            typeof block.content === 'string'
              ? block.content
              : JSON.stringify(block.content || '')
          )
        }
      }
    }
  }
  return total
}

/**
 * Estimate approximate cost in millicents for a request.
 * Rates: Sonnet $3/M input, $15/M output (approximation).
 * @param {number} inputTokens
 * @param {number} estimatedOutputTokens
 * @returns {number} millicents
 */
function estimateCostMillicents(inputTokens, estimatedOutputTokens = 500) {
  return Math.round(inputTokens * 0.3 + estimatedOutputTokens * 1.5)
}

/**
 * Check if a request would stay within the monthly budget.
 *
 * @param {string} credentialId
 * @param {number} estimatedCostMillicents
 * @returns {{ withinBudget: boolean, remainingCents: number, warningThreshold: boolean }}
 *          warningThreshold = true when < 10% of the monthly budget remains
 */
function checkMonthlyBudget(credentialId, estimatedCostMillicents) {
  const db = getDb()
  const cred = db.prepare(
    'SELECT monthly_budget_cents, current_spend_cents FROM credentials WHERE id = ?'
  ).get(credentialId)

  if (!cred || cred.monthly_budget_cents === 0) {
    return { withinBudget: true, remainingCents: Infinity, warningThreshold: false }
  }

  const spentCents = cred.current_spend_cents || 0
  const limitCents = cred.monthly_budget_cents
  const remainingCents = limitCents - spentCents
  const estimatedCostCents = estimatedCostMillicents / 1000

  return {
    withinBudget: estimatedCostCents <= remainingCents,
    remainingCents,
    warningThreshold: remainingCents < limitCents * 0.1  // last 10%
  }
}

/**
 * Compress a messages array by folding old turns into a summary stub.
 * Always retains the `keepLast` most-recent messages verbatim.
 *
 * This is a local, free compression (no API call required). A future
 * upgrade could send the compressed slice to Claude for a proper summary.
 *
 * @param {Array} messages
 * @param {number} keepLast
 * @returns {{ messages: Array, compressed: boolean, droppedCount: number }}
 */
function compressContext(messages, keepLast = COMPRESS_KEEP_LAST) {
  if (messages.length <= keepLast) {
    return { messages, compressed: false, droppedCount: 0 }
  }

  const toFold = messages.slice(0, -keepLast)
  const recent = messages.slice(-keepLast)

  const lines = toFold
    .filter(m => typeof m.content === 'string' && m.content.trim())
    .map(m => {
      const snippet = m.content.substring(0, 300)
      return `[${m.role}]: ${snippet}${m.content.length > 300 ? '…' : ''}`
    })

  const summaryText =
    `[Earlier conversation — ${toFold.length} messages compressed]\n` +
    lines.join('\n')

  return {
    messages: [{ role: 'user', content: summaryText }, ...recent],
    compressed: true,
    droppedCount: toFold.length
  }
}

/**
 * Compress a messages array using Claude for a real semantic summary.
 *
 * The messages to be folded are sent to Claude with a summarisation prompt.
 * The result is a single user-turn stub that the model will read as prior
 * context — far more useful than simple string truncation.
 *
 * Falls back to local compressContext if the API call fails.
 *
 * @param {Array}  messages   — full Anthropic messages array
 * @param {{
 *   apiKey: string,
 *   model?: string,
 *   keepLast?: number
 * }} opts
 * @returns {Promise<{ messages: Array, wasCompressed: boolean, droppedCount: number, method: string }>}
 */
async function compressContextWithAI(messages, { apiKey, model, keepLast = COMPRESS_KEEP_LAST }) {
  if (messages.length <= keepLast) {
    return { messages, wasCompressed: false, droppedCount: 0, method: 'none' }
  }

  const toFold = messages.slice(0, -keepLast)
  const recent = messages.slice(-keepLast)

  // Build a plain-text transcript of the messages to fold
  const transcript = toFold.map(m => {
    const text = typeof m.content === 'string'
      ? m.content
      : (m.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    return `[${m.role.toUpperCase()}]: ${text.substring(0, 800)}`
  }).join('\n\n')

  try {
    const Anthropic = require('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model:      model || 'claude-haiku-4-20250514',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content:
          `Summarise the following conversation excerpt in ≤ 400 words. ` +
          `Preserve key decisions, facts, preferences, and any unresolved questions. ` +
          `Write in third person. Output only the summary, no preamble.\n\n` +
          transcript
      }]
    })

    const summary = response.content.find(b => b.type === 'text')?.text || transcript.substring(0, 1000)
    const stub    = `[Conversation summary — ${toFold.length} earlier messages]\n${summary}`

    console.log(`[token-budget] AI compression: folded ${toFold.length} messages into ${summary.length}-char summary`)

    return {
      messages:     [{ role: 'user', content: stub }, ...recent],
      wasCompressed: true,
      droppedCount:  toFold.length,
      method:       'ai'
    }
  } catch (err) {
    console.warn(`[token-budget] AI compression failed (${err.message}), using local fallback`)
    const local = compressContext(messages, keepLast)
    return { ...local, method: 'local-fallback' }
  }
}

/**
 * Return the messages array, compressing it first if it is too large.
 *
 * Pass opts.apiKey + opts.model to use AI summarisation;
 * omit them for the free local truncation fallback.
 *
 * @param {Array}   messages
 * @param {{ apiKey?: string, model?: string }} [opts]
 * @returns {Promise<{ messages: Array, wasCompressed: boolean }>}
 */
async function ensureContextFits(messages, opts = {}) {
  const tokens = estimateContextTokens(messages)
  if (tokens < COMPRESS_ABOVE_TOKENS) {
    return { messages, wasCompressed: false }
  }

  if (opts.apiKey) {
    return compressContextWithAI(messages, opts)
  }

  const { messages: compressed, compressed: wasCompressed, droppedCount } = compressContext(messages)
  if (wasCompressed) {
    console.log(`[token-budget] Local compression: dropped ${droppedCount} messages (was ~${tokens} tokens)`)
  }
  return { messages: compressed, wasCompressed }
}

module.exports = {
  estimateTokens,
  estimateContextTokens,
  estimateCostMillicents,
  checkMonthlyBudget,
  compressContext,
  compressContextWithAI,
  ensureContextFits,
  COMPRESS_ABOVE_TOKENS,
}

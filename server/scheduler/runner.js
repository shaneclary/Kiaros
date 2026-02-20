/**
 * Scheduled Job Runner (Phase 12)
 *
 * Executes a single scheduled job:
 *   1. Decrypt the API key from the stored credential
 *   2. Build a system prompt that includes working memory context
 *   3. Call Claude synchronously (non-streaming — no SSE client)
 *   4. Archive the response via archiveChunk (semantic memory)
 *   5. Send a desktop notification with a trimmed summary
 *   6. Return { summary, inputTokens, outputTokens }
 *
 * Security: the encKey Buffer is consumed locally and not retained.
 * The plaintext API key exists only for the duration of the HTTP call.
 */

const Anthropic = require('@anthropic-ai/sdk')
const { getDecryptedKey, getActiveCredentialId, listCredentials, recordSpend } = require('../credentials/manager')
const { buildMemoryContext } = require('../memory/working')
const { archiveChunk } = require('../memory/archive')
const { sendNotification } = require('../orchestration/notify')

const SCHEDULER_SYSTEM = `You are Kiaros, a personal AI executive assistant running a scheduled task.
Complete the task concisely and accurately. The user will read your response as a notification summary.
Working memory context is included in the system prompt below.`

/**
 * Run a scheduled job and return its result.
 *
 * @param {object} job  - Row from scheduled_jobs table
 * @param {Buffer} encKey - Passphrase-derived encryption key (from scheduler unlock)
 * @returns {Promise<{ summary: string, inputTokens: number, outputTokens: number }>}
 */
async function runJob(job, encKey) {
  // ── Resolve credential ─────────────────────────────────────────────────
  const credId = job.credential_id || getActiveCredentialId()
  if (!credId) throw new Error('No API credential configured')

  let apiKey
  try {
    apiKey = getDecryptedKey(credId, encKey)
  } catch (err) {
    throw new Error(`Cannot decrypt API key: ${err.message}`)
  }

  // Resolve model (job override → credential default → hardcoded fallback)
  let model = job.model
  if (!model) {
    const creds = listCredentials()
    const cred  = creds.find(c => c.id === credId)
    model = cred?.model || 'claude-haiku-4-20250514'
  }

  // ── Build system prompt ────────────────────────────────────────────────
  const memoryCtx = buildMemoryContext()
  const systemPrompt = SCHEDULER_SYSTEM + (memoryCtx ? `\n${memoryCtx}` : '')

  // ── Call Claude (non-streaming) ────────────────────────────────────────
  let response
  try {
    const client = new Anthropic({ apiKey })
    response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: job.prompt }]
    })
  } finally {
    apiKey = null  // Release plaintext key as early as possible
  }

  const resultText = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')

  const inputTokens  = response.usage?.input_tokens  || 0
  const outputTokens = response.usage?.output_tokens || 0

  // ── Record spend ───────────────────────────────────────────────────────
  if (credId && (inputTokens + outputTokens) > 0) {
    // Approximate: haiku ~$0.80/M input, $4/M output (millicents per token)
    const millicents = Math.round(inputTokens * 0.0008 + outputTokens * 0.004)
    try { recordSpend(credId, millicents) } catch {}
  }

  // ── Archive result ─────────────────────────────────────────────────────
  const archiveContent = `[scheduled: ${job.name}] ${job.prompt}\n\nResult: ${resultText}`
  await archiveChunk({
    content: archiveContent,
    source: 'scheduled',
    sessionId: job.id
  }).catch(() => {}) // Non-blocking — archive failure shouldn't kill the job

  // ── Desktop notification ───────────────────────────────────────────────
  const summary = resultText.length > 120
    ? resultText.substring(0, 117) + '…'
    : resultText

  await sendNotification({
    summary: `Kiaros: ${job.name}`,
    body: summary,
    urgency: 'low',
    timeoutMs: 10000
  }).catch(() => {})

  return { summary, inputTokens, outputTokens }
}

module.exports = { runJob }

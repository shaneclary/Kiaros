/**
 * Token Budget Manager
 *
 * Provides:
 *  - Local token estimation (4 chars/token heuristic — good enough for budgeting)
 *  - Monthly spend guard: warns before a request would exceed the budget ceiling
 *  - Context compression: when the conversation grows large, fold the oldest
 *    messages into a single summary stub so the model's context window stays safe
 *
 * None of these functions make external API calls; all logic is local.
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
 * Return the messages array, compressing it first if it is too large.
 * Call this before each loop iteration in the agentic loop.
 *
 * @param {Array} messages
 * @returns {{ messages: Array, wasCompressed: boolean }}
 */
function ensureContextFits(messages) {
  const tokens = estimateContextTokens(messages)
  if (tokens < COMPRESS_ABOVE_TOKENS) {
    return { messages, wasCompressed: false }
  }
  const { messages: compressed, compressed: wasCompressed, droppedCount } = compressContext(messages)
  if (wasCompressed) {
    console.log(`[token-budget] Context compressed: dropped ${droppedCount} messages (was ~${tokens} tokens)`)
  }
  return { messages: compressed, wasCompressed }
}

module.exports = {
  estimateTokens,
  estimateContextTokens,
  estimateCostMillicents,
  checkMonthlyBudget,
  compressContext,
  ensureContextFits,
  COMPRESS_ABOVE_TOKENS,
}

const { getTool, getRiskLevel } = require('../tools/registry')
const config = require('../config')

/**
 * Pending interrupt requests: id -> { resolve, reject, action }
 * Client polls these and resolves them via the approval endpoint
 */
const pendingInterrupts = new Map()

/**
 * Determine if an action should be interrupted for user approval
 * @param {object} action - { toolId, input }
 * @param {string} mode - 'confirm' | 'smart' | 'auto'
 * @returns {boolean}
 */
function shouldInterrupt(action, mode) {
  if (mode === 'auto') return false
  if (mode === 'confirm') return true
  if (mode === 'smart') {
    try {
      const tool = getTool(action.toolId)
      if (!tool) return true
      const riskLevel = getRiskLevel(tool.requiredScopes)
      return riskLevel === 'high' || !tool.reversible
    } catch {
      return true // Err on the side of caution
    }
  }
  return true // Default: always interrupt
}

/**
 * Request user approval for an action via interrupt gate.
 * Returns a promise that resolves when user approves or rejects.
 * Times out after 5 minutes.
 *
 * @param {string} interruptId - unique id for this interrupt
 * @param {object} action - { toolId, toolName, input }
 * @returns {Promise<boolean>} true if approved, false if blocked
 */
function requestApproval(interruptId, action) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingInterrupts.delete(interruptId)
      resolve(false) // Auto-block on timeout
    }, 5 * 60 * 1000)

    pendingInterrupts.set(interruptId, {
      resolve: (approved) => {
        clearTimeout(timeout)
        pendingInterrupts.delete(interruptId)
        resolve(approved)
      },
      reject: (err) => {
        clearTimeout(timeout)
        pendingInterrupts.delete(interruptId)
        reject(err)
      },
      action,
      createdAt: Date.now()
    })
  })
}

/**
 * Resolve a pending interrupt (called from API endpoint)
 * @param {string} interruptId
 * @param {boolean} approved
 */
function resolveInterrupt(interruptId, approved) {
  const pending = pendingInterrupts.get(interruptId)
  if (!pending) throw new Error('Interrupt not found or expired')
  pending.resolve(approved)
}

/**
 * Get all pending interrupts (for client polling)
 */
function getPendingInterrupts() {
  const result = []
  for (const [id, data] of pendingInterrupts.entries()) {
    result.push({
      id,
      action: data.action,
      createdAt: data.createdAt
    })
  }
  return result
}

module.exports = { shouldInterrupt, requestApproval, resolveInterrupt, getPendingInterrupts }

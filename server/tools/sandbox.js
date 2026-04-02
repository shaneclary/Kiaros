const audit = require('../audit/logger')

async function sandboxExecute(toolId, toolName, input, executeFn, opts = {}) {
  const start = Date.now()

  // Log action BEFORE execution
  const logId = audit.logAction({
    sessionId: opts.sessionId,
    toolId,
    toolName,
    input,
    approvedBy: opts.approvedBy || 'user',
    reversible: opts.reversible || false
  })

  try {
    // Enforce timeout
    const timeout = opts.timeoutMs || 10000
    const result = await Promise.race([
      executeFn(input),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool timeout (${timeout}ms)`)), timeout)
      )
    ])

    const duration = Date.now() - start

    // Log success
    audit.updateAction(logId, {
      output: result,
      durationMs: duration,
      tokenCost: opts.tokenCost
    })

    return { success: true, result, logId }
  } catch (err) {
    const duration = Date.now() - start

    audit.updateAction(logId, {
      durationMs: duration,
      error: err.message
    })

    return { success: false, error: err.message, logId }
  }
}

module.exports = { sandboxExecute }

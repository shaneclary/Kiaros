const { canInvokeTool, executeTool, BUILTIN_TOOLS } = require('../tools/registry')
const { sandboxExecute } = require('../tools/sandbox')
const { shouldInterrupt, createInterrupt } = require('./interrupt-gate')
const { getRiskLevel } = require('../tools/scopes')
const tickEngine = require('../tick/engine')

/**
 * Execute a tool call from Claude's response, with interrupt gate
 */
async function executeToolCall(toolCall, sessionId, onInterrupt) {
  const toolId = toolCall.name
  const input = toolCall.input

  // Check scope approval
  canInvokeTool(toolId)

  const tool = BUILTIN_TOOLS[toolId]
  if (!tool) throw new Error(`Unknown tool: ${toolId}`)

  const riskLevel = getRiskLevel(tool.requiredScopes)

  // Check interrupt gate
  if (shouldInterrupt({ toolId, riskLevel, scopes: tool.requiredScopes })) {
    const interrupt = createInterrupt({
      toolId,
      toolName: tool.name,
      input,
      riskLevel,
      scopes: tool.requiredScopes
    })

    // Notify frontend
    if (onInterrupt) {
      onInterrupt(interrupt.id, {
        toolId,
        toolName: tool.name,
        input,
        riskLevel
      })
    }

    // Wait for user decision
    const decision = await interrupt.promise
    if (!decision.approved) {
      return {
        success: false,
        error: `Action blocked: ${decision.reason}`,
        blocked: true
      }
    }
  }

  // Record activity for tick engine
  tickEngine.recordActivity()

  // Execute in sandbox
  return await sandboxExecute(
    toolId,
    tool.name,
    input,
    tool.execute,
    {
      sessionId,
      approvedBy: 'user',
      reversible: tool.reversible,
      timeoutMs: tool.timeoutMs
    }
  )
}

module.exports = { executeToolCall }

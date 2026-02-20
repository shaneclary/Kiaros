const crypto = require('crypto')
const config = require('../config')
const { canInvokeTool, getTool } = require('../tools/registry')
const { validateInput, withTimeout, sanitizeOutput } = require('../tools/sandbox')
const { shouldInterrupt, requestApproval } = require('./interrupt-gate')
const { logAction, updateAction } = require('../audit/logger')

// Import builtin tool handlers
const { readFile }                      = require('../tools/builtin/file-reader')
const { writeFile }                     = require('../tools/builtin/file-writer')
const { webFetch }                      = require('../tools/builtin/web-fetch')
const { writeNote }                     = require('../tools/builtin/note-taker')
const { shellExec }                     = require('../tools/builtin/shell-exec')
const { clipboardRead, clipboardWrite } = require('../tools/builtin/clipboard')

// MCP runner — loaded lazily to avoid circular deps
let mcpRunner = null
function getMcpRunner() {
  if (!mcpRunner) mcpRunner = require('../tools/mcp-runner')
  return mcpRunner
}

// Generated skill loader — loaded lazily to avoid startup cost
let generatorModule = null
function loadGeneratedHandler(handlerPath) {
  if (!generatorModule) generatorModule = require('../tools/generator')
  return generatorModule.loadGeneratedHandler(handlerPath)
}

// Built-in tool handlers map
const BUILTIN_HANDLERS = {
  'file-reader':     readFile,
  'file-writer':     writeFile,
  'web-fetch':       webFetch,
  'note-taker':      writeNote,
  'shell-exec':      shellExec,
  'clipboard-read':  clipboardRead,
  'clipboard-write': clipboardWrite,
}

/**
 * Execute a single tool call.
 * Handles: scope check → interrupt gate → audit → execution → audit update
 *
 * @param {{ toolId, toolName, input, sessionId }} step
 * @returns {Promise<object>} tool output
 */
async function executeToolCall(step) {
  const { toolId, toolName, input, sessionId } = step
  const interruptMode = config.get('interruptMode') || 'confirm'

  // 1. Check scope approval (throws if not approved)
  canInvokeTool(toolId)

  // 2. Validate input
  const validatedInput = validateInput(input)

  // 3. Get tool metadata
  const tool = getTool(toolId)
  if (!tool) throw new Error(`Tool "${toolId}" not found`)

  // 4. Interrupt gate — ask user if needed
  if (shouldInterrupt({ toolId, toolName, input: validatedInput }, interruptMode)) {
    const interruptId = crypto.randomUUID()
    const approved = await requestApproval(interruptId, {
      toolId,
      toolName: tool.name,
      input: validatedInput,
      riskLevel: tool.riskLevel
    })

    if (!approved) {
      throw new Error(`Action blocked by user: ${tool.name}`)
    }
  }

  // 5. Log action BEFORE execution
  const auditId = logAction({
    sessionId,
    toolId,
    toolName: tool.name,
    input: validatedInput,
    approvedBy: interruptMode === 'auto' ? 'auto' : 'user',
    reversible: tool.reversible,
  })

  const startTime = Date.now()

  try {
    let output

    // 6. Execute: builtin, generated skill, or MCP
    if (BUILTIN_HANDLERS[toolId]) {
      output = await withTimeout(
        () => BUILTIN_HANDLERS[toolId](validatedInput),
        tool.timeoutMs || 10000
      )
    } else {
      // Check for generated skill handler path
      const row = require('../db/client').getDb()
        .prepare('SELECT generated_handler_path FROM tool_registry WHERE id = ?').get(toolId)
      const generatedPath = row?.generated_handler_path

      if (generatedPath) {
        const handler = loadGeneratedHandler(generatedPath)
        output = await withTimeout(() => handler.execute(validatedInput), tool.timeoutMs || 15000)
      } else if (tool.mcpConfig) {
        output = await getMcpRunner().invokeMcpTool(toolId, validatedInput, tool.timeoutMs)
      } else {
        throw new Error(`No handler found for tool "${toolId}"`)
      }
    }

    const sanitized = sanitizeOutput(output)
    const durationMs = Date.now() - startTime

    // Store undo data if reversible
    if (tool.reversible && output?.undoData) {
      const db = require('../db/client').getDb()
      db.prepare('UPDATE audit_log SET undo_data = ? WHERE id = ?').run(
        JSON.stringify(output.undoData), auditId
      )
    }

    // 7. Update audit log with result
    updateAction(auditId, {
      output: sanitized,
      durationMs,
    })

    return sanitized

  } catch (err) {
    updateAction(auditId, {
      error: err.message,
      durationMs: Date.now() - startTime,
    })
    throw err
  }
}

module.exports = { executeToolCall }

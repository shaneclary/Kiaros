const Anthropic = require('@anthropic-ai/sdk')
const { listTools: getRegistryTools, canInvokeTool } = require('../tools/registry')
const { executeToolCall } = require('../orchestration/executor')
const { buildPlan, summarizePlan } = require('../orchestration/planner')
const { ensureContextFits } = require('../orchestration/token-budget')

/**
 * Build Anthropic tool definitions from approved registry tools
 */
function buildAnthropicTools() {
  const tools = getRegistryTools().filter(t => t.approved && t.enabled)

  return tools.map(tool => ({
    name: tool.id,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties: buildSchemaForTool(tool.id),
      required: []
    }
  }))
}

function buildSchemaForTool(toolId) {
  // Define input schemas per tool type
  const schemas = {
    'file-reader': {
      path: { type: 'string', description: 'Absolute path to the file to read' }
    },
    'file-writer': {
      path: { type: 'string', description: 'Absolute path to write the file' },
      content: { type: 'string', description: 'Content to write' }
    },
    'web-fetch': {
      url: { type: 'string', description: 'HTTPS URL to fetch' }
    },
    'note-taker': {
      content: { type: 'string', description: 'Note content to save' },
      filename: { type: 'string', description: 'Optional filename (default: auto-generated)' }
    }
  }
  return schemas[toolId] || { input: { type: 'string', description: 'Tool input' } }
}

/**
 * Stream a chat completion with tool use support
 * @param {{ messages, systemPrompt, apiKey, model, sessionId, onToken, onToolCall, onToolResult }} opts
 */
async function streamChat({ messages, systemPrompt, apiKey, model, sessionId, onToken, onToolCall, onToolResult, onPlan }) {
  // SECURITY: apiKey must never be logged
  const client = new Anthropic({ apiKey })

  const anthropicTools = buildAnthropicTools()

  let continueLoop = true
  let allMessages = [...messages]
  let totalInputTokens = 0
  let totalOutputTokens = 0

  while (continueLoop) {
    // Compress context if it has grown too large for the model's window
    const { messages: fittedMessages } = ensureContextFits(allMessages)
    allMessages = fittedMessages

    const streamParams = {
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt || '',
      messages: allMessages,
    }

    if (anthropicTools.length > 0) {
      streamParams.tools = anthropicTools
    }

    const stream = await client.messages.stream(streamParams)

    let assistantContent = []
    let currentTextBlock = null
    let toolUseBlocks = []

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'text') {
          currentTextBlock = { type: 'text', text: '' }
          assistantContent.push(currentTextBlock)
        } else if (event.content_block.type === 'tool_use') {
          toolUseBlocks.push({
            type: 'tool_use',
            id: event.content_block.id,
            name: event.content_block.name,
            input: ''
          })
          assistantContent.push(toolUseBlocks[toolUseBlocks.length - 1])
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta' && currentTextBlock) {
          currentTextBlock.text += event.delta.text
          if (onToken) onToken(event.delta.text)
        } else if (event.delta.type === 'input_json_delta') {
          const lastTool = toolUseBlocks[toolUseBlocks.length - 1]
          if (lastTool) lastTool.input += event.delta.partial_json
        }
      } else if (event.type === 'message_delta') {
        if (event.usage) {
          totalOutputTokens += event.usage.output_tokens || 0
        }
      } else if (event.type === 'message_start') {
        if (event.message?.usage) {
          totalInputTokens += event.message.usage.input_tokens || 0
        }
      }
    }

    // Parse tool inputs from JSON strings
    for (const block of toolUseBlocks) {
      try {
        block.input = JSON.parse(block.input || '{}')
      } catch {
        block.input = {}
      }
    }

    // Add assistant message to conversation
    allMessages.push({ role: 'assistant', content: assistantContent })

    // Handle tool calls if any
    if (toolUseBlocks.length > 0) {
      // Build and emit plan before any tool runs
      if (onPlan) {
        try {
          const rawSteps = toolUseBlocks.map(t => ({ toolId: t.name, input: t.input }))
          const plan = buildPlan(rawSteps)
          onPlan({ steps: plan, summary: summarizePlan(plan) })
        } catch {
          // Registry mismatch — skip plan emission, tools will still run
        }
      }

      const toolResults = []

      for (const toolUse of toolUseBlocks) {
        if (onToolCall) onToolCall({ id: toolUse.id, name: toolUse.name, input: toolUse.input })

        let result
        let isError = false

        try {
          result = await executeToolCall({
            toolId: toolUse.name,
            toolName: toolUse.name,
            input: toolUse.input,
            sessionId
          })
        } catch (err) {
          result = { error: err.message }
          isError = true
        }

        if (onToolResult) onToolResult({ id: toolUse.id, name: toolUse.name, result, isError })

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
          is_error: isError
        })
      }

      // Add tool results and continue loop
      allMessages.push({ role: 'user', content: toolResults })
      continueLoop = true
    } else {
      // No tool calls — we're done
      continueLoop = false
    }
  }

  return {
    messages: allMessages,
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
  }
}

/**
 * Test an API key by making a minimal ping request
 * @param {string} apiKey
 * @returns {{ valid: boolean, model?: string, error?: string }}
 */
async function testApiKey(apiKey) {
  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-haiku-4-20250514',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ping' }]
    })
    return { valid: true, model: response.model }
  } catch (err) {
    // Never expose the API key in error messages
    return { valid: false, error: err.message?.replace(/sk-ant-[^\s]*/g, '***') }
  }
}

module.exports = { streamChat, testApiKey, buildAnthropicTools }

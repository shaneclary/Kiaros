const Anthropic = require('@anthropic-ai/sdk')
const working = require('../memory/working')

let clientCache = null

function getClient(apiKey) {
  if (clientCache && clientCache._apiKey === apiKey) return clientCache
  clientCache = new Anthropic({ apiKey })
  clientCache._apiKey = apiKey
  return clientCache
}

async function chat(apiKey, messages, tools, model, onStream) {
  const client = getClient(apiKey)

  // Inject working memory into system prompt
  const memoryContext = working.toContextString()
  const systemPrompt = [
    'You are Kiaros, an AI assistant with tool access. You help users by thinking step-by-step and using available tools when needed.',
    'When you need to perform actions, use the provided tools. Always explain what you\'re doing.',
    memoryContext ? `\n\n${memoryContext}` : ''
  ].join('')

  const params = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  }

  if (tools && tools.length > 0) {
    params.tools = tools
  }

  if (onStream) {
    // Streaming response
    const stream = await client.messages.stream(params)

    let fullContent = ''
    let toolUseBlocks = []
    let inputTokens = 0
    let outputTokens = 0

    stream.on('text', (text) => {
      fullContent += text
      onStream({ type: 'text', text })
    })

    stream.on('contentBlock', (block) => {
      if (block.type === 'tool_use') {
        toolUseBlocks.push(block)
        onStream({ type: 'tool_use', tool: block })
      }
    })

    const finalMessage = await stream.finalMessage()
    inputTokens = finalMessage.usage?.input_tokens || 0
    outputTokens = finalMessage.usage?.output_tokens || 0

    return {
      content: fullContent,
      toolCalls: toolUseBlocks,
      stopReason: finalMessage.stop_reason,
      usage: { inputTokens, outputTokens }
    }
  } else {
    // Non-streaming (for tick engine)
    const response = await client.messages.create(params)

    const textBlocks = response.content.filter(b => b.type === 'text')
    const toolBlocks = response.content.filter(b => b.type === 'tool_use')

    return {
      content: textBlocks.map(b => b.text).join(''),
      toolCalls: toolBlocks,
      stopReason: response.stop_reason,
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0
      }
    }
  }
}

async function testConnection(apiKey) {
  try {
    const client = getClient(apiKey)
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Reply with "ok"' }]
    })
    return { success: true, model: resp.model }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { chat, testConnection }

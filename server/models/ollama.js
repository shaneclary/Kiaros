/**
 * Ollama local model provider (Phase 7 feature)
 * Provides a fallback to locally-running Ollama models
 * No API key required — fully local inference
 */

const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

/**
 * Stream a chat completion via Ollama
 * @param {{ messages, systemPrompt, model, onToken }} opts
 */
async function streamChat({ messages, systemPrompt, model, onToken }) {
  const ollamaUrl = DEFAULT_OLLAMA_URL
  const ollamaModel = model || 'llama3.2'

  // Convert messages to Ollama format
  const ollamaMessages = []
  if (systemPrompt) {
    ollamaMessages.push({ role: 'system', content: systemPrompt })
  }
  for (const msg of messages) {
    ollamaMessages.push({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content :
        msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
    })
  }

  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel,
      messages: ollamaMessages,
      stream: true
    })
  })

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n').filter(l => l.trim())

    for (const line of lines) {
      try {
        const data = JSON.parse(line)
        if (data.message?.content) {
          const token = data.message.content
          fullContent += token
          if (onToken) onToken(token)
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  const updatedMessages = [
    ...messages,
    { role: 'assistant', content: fullContent }
  ]

  return {
    messages: updatedMessages,
    usage: { inputTokens: 0, outputTokens: 0 } // Ollama doesn't report tokens
  }
}

/**
 * Test connection to Ollama
 */
async function testConnection() {
  try {
    const response = await fetch(`${DEFAULT_OLLAMA_URL}/api/tags`)
    if (!response.ok) return { valid: false, error: 'Ollama not responding' }
    const data = await response.json()
    return { valid: true, models: data.models?.map(m => m.name) || [] }
  } catch (err) {
    return { valid: false, error: 'Cannot connect to Ollama. Is it running?' }
  }
}

module.exports = { streamChat, testConnection }

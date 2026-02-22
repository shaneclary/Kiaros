import { api } from './api'

interface StreamChatOptions {
  message: string
  sessionId?: string | null
  token?: string
  onEvent: (event: string, data: Record<string, unknown>) => void
}

// Parse a single SSE message block into { event, data }
function parseMessage(raw: string): { event: string; data: Record<string, unknown> } | null {
  let event = 'message'
  let dataStr = ''
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) dataStr = line.slice(5).trim()
  }
  if (!dataStr) return null
  try {
    return { event, data: JSON.parse(dataStr) }
  } catch {
    return null
  }
}

export async function streamChat({ message, sessionId, token, onEvent }: StreamChatOptions): Promise<void> {
  const res = await api.stream('/chat/stream', { message, sessionId }, token)

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      const j = await res.json() as { error?: string }
      if (j.error) errMsg = j.error
    } catch {}
    throw new Error(errMsg)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // SSE messages are separated by double newlines
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const msg = parseMessage(part.trim())
      if (msg) onEvent(msg.event, msg.data)
    }
  }

  // Handle any remaining buffer content
  if (buffer.trim()) {
    const msg = parseMessage(buffer.trim())
    if (msg) onEvent(msg.event, msg.data)
  }
}

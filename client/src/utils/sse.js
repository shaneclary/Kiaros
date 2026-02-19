/**
 * SSE client for streaming chat responses
 */
export function streamChat({ message, sessionId, credentialId, provider, token, onEvent }) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message, sessionId, credentialId, provider })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        return reject(new Error(err.error || 'Chat request failed'))
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete last line

        let currentEvent = null
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6))
              onEvent(currentEvent, data)
              if (currentEvent === 'done') {
                resolve(data)
              } else if (currentEvent === 'error') {
                reject(new Error(data.error || 'Stream error'))
              }
            } catch {
              // Skip malformed JSON
            }
            currentEvent = null
          }
        }
      }

      resolve({})
    } catch (err) {
      reject(err)
    }
  })
}

const express = require('express')
const router = express.Router()
const { requireAuth } = require('../auth/passphrase')
const {
  createSession, listSessions, getMessages,
  addMessage, deleteSession, updateSessionTitle
} = require('../memory/session')
const { buildMemoryContext } = require('../memory/working')
const { getDecryptedKey, getActiveCredentialId, recordSpend, listCredentials } = require('../credentials/manager')
const { streamChat } = require('../models/anthropic')
const { streamChat: ollamaStreamChat } = require('../models/ollama')
const config = require('../config')

router.use(requireAuth)

// GET /api/chat/sessions
router.get('/sessions', (req, res) => {
  try {
    res.json(listSessions())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/chat/sessions/:id
router.get('/sessions/:id', (req, res) => {
  try {
    const msgs = getMessages(req.params.id)
    res.json(msgs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/chat/sessions/:id
router.delete('/sessions/:id', (req, res) => {
  try {
    deleteSession(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/chat — SSE streaming chat
router.post('/', async (req, res) => {
  const { message, sessionId: existingSessionId, credentialId, provider } = req.body

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }
  if (message.length > 100000) {
    return res.status(400).json({ error: 'message too long (max 100k chars)' })
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  try {
    // Get or create session
    let sessionId = existingSessionId
    if (!sessionId) {
      sessionId = createSession()
    }

    // Store user message
    addMessage(sessionId, 'user', message)

    // Send session id to client
    send('session', { sessionId })

    // Get conversation history
    const dbMessages = getMessages(sessionId)
    const anthropicMessages = dbMessages.map(m => ({
      role: m.role,
      content: m.content
    }))

    // Build system prompt with memory context
    const memoryContext = buildMemoryContext()
    const systemPrompt = `You are Kiaros, a helpful personal AI executive assistant. You help users manage tasks, analyze information, and take actions on their behalf — always with their explicit approval.

Security and transparency are paramount. Always explain what you're doing before doing it.${memoryContext}`

    let fullResponse = ''

    if (provider === 'ollama') {
      // Use Ollama local model
      const result = await ollamaStreamChat({
        messages: anthropicMessages,
        systemPrompt,
        model: config.get('ollamaModel') || 'llama3.2',
        onToken: (token) => {
          fullResponse += token
          send('token', { token })
        }
      })
    } else {
      // Use Anthropic (default)
      const activeCredId = credentialId || getActiveCredentialId()
      if (!activeCredId) {
        send('error', { error: 'No API key configured. Please add one in Settings.' })
        return res.end()
      }

      let apiKey
      try {
        // req.encKey is the passphrase-derived in-memory AES key — NEVER log it
        apiKey = getDecryptedKey(activeCredId, req.encKey)
      } catch (err) {
        send('error', { error: 'Failed to retrieve API key. Please re-add it in Settings.' })
        return res.end()
      }

      const creds = listCredentials()
      const activeCred = creds.find(c => c.id === activeCredId)
      const model = activeCred?.model || 'claude-sonnet-4-20250514'

      try {
        const result = await streamChat({
          messages: anthropicMessages,
          systemPrompt,
          apiKey,
          model,
          sessionId,
          onToken: (token) => {
            fullResponse += token
            send('token', { token })
          },
          onPlan: (plan) => {
            send('plan', plan)
          },
          onToolCall: (toolCall) => {
            send('tool_call', toolCall)
          },
          onToolResult: (toolResult) => {
            send('tool_result', toolResult)
          }
        })

        // Track token costs (approximate: $3/M input, $15/M output for Sonnet)
        if (result.usage) {
          const millicents = Math.round(
            (result.usage.inputTokens * 0.3 + result.usage.outputTokens * 1.5)
          )
          recordSpend(activeCredId, millicents)
        }

        // Extract full assistant response from result
        const lastAssistantMsg = [...result.messages].reverse().find(m => m.role === 'assistant')
        if (lastAssistantMsg && typeof lastAssistantMsg.content === 'string') {
          fullResponse = lastAssistantMsg.content
        } else if (lastAssistantMsg && Array.isArray(lastAssistantMsg.content)) {
          fullResponse = lastAssistantMsg.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('')
        }
      } finally {
        // SECURITY: zero out apiKey from memory
        apiKey = null
      }
    }

    // Store assistant response
    if (fullResponse) {
      addMessage(sessionId, 'assistant', fullResponse)
    }

    // Auto-title session from first message
    const sessions = listSessions()
    const session = sessions.find(s => s.id === sessionId)
    if (session && session.title.startsWith('Session ')) {
      const title = message.substring(0, 60) + (message.length > 60 ? '…' : '')
      updateSessionTitle(sessionId, title)
    }

    send('done', { sessionId })
    res.end()

  } catch (err) {
    console.error('[chat] Error:', err.message)
    send('error', { error: err.message })
    res.end()
  }
})

module.exports = router

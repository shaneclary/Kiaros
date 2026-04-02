const express = require('express')
const { requireAuth } = require('../auth/passphrase')
const session = require('../memory/session')
const anthropic = require('../models/anthropic')
const creds = require('../credentials/manager')
const { getToolDefinitions, canInvokeTool, listTools } = require('../tools/registry')
const { executeToolCall } = require('../orchestration/executor')
const tickEngine = require('../tick/engine')

const router = express.Router()
router.use(requireAuth)

router.post('/', async (req, res) => {
  try {
    const { message, sessionId, passphrase } = req.body
    if (!message || !passphrase) {
      return res.status(400).json({ error: 'Missing message or passphrase' })
    }

    // Get API key
    const cred = creds.getActiveCredential(passphrase)
    if (!cred) return res.status(400).json({ error: 'No active API credential' })

    // Get or create session
    let sid = sessionId
    if (!sid) {
      sid = session.createSession(message.substring(0, 50))
    }

    // Store user message
    session.addMessage(sid, 'user', message)

    // Record activity for tick engine
    tickEngine.recordActivity()

    // Build message history
    const history = session.getContextWindow(sid)

    // Get approved tools
    const approvedTools = listTools().filter(t => t.approved)
    const toolDefs = approvedTools.length > 0 ? getToolDefinitions().filter(t =>
      approvedTools.some(at => at.id === t.name)
    ) : []

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    sendEvent('session', { sessionId: sid })

    let fullResponse = ''
    let allToolCalls = []

    // Chat with tool use loop
    let messages = history
    let continueLoop = true

    while (continueLoop) {
      const result = await anthropic.chat(
        cred.apiKey,
        messages,
        toolDefs,
        cred.model,
        (chunk) => {
          if (chunk.type === 'text') {
            sendEvent('text', { text: chunk.text })
            fullResponse += chunk.text
          } else if (chunk.type === 'tool_use') {
            sendEvent('tool_call', {
              id: chunk.tool.id,
              name: chunk.tool.name,
              input: chunk.tool.input
            })
          }
        }
      )

      if (result.toolCalls && result.toolCalls.length > 0) {
        // Execute tool calls
        const toolResults = []
        for (const tc of result.toolCalls) {
          sendEvent('tool_executing', { name: tc.name, input: tc.input })

          try {
            const execResult = await executeToolCall(tc, sid, (interruptId, action) => {
              sendEvent('interrupt', { interruptId, ...action })
            })

            if (execResult.blocked) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tc.id,
                content: `Action blocked by user: ${execResult.error}`
              })
              sendEvent('tool_blocked', { name: tc.name })
            } else if (execResult.success) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tc.id,
                content: JSON.stringify(execResult.result)
              })
              sendEvent('tool_result', { name: tc.name, success: true })
            } else {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tc.id,
                content: `Error: ${execResult.error}`,
                is_error: true
              })
              sendEvent('tool_error', { name: tc.name, error: execResult.error })
            }
          } catch (err) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: `Error: ${err.message}`,
              is_error: true
            })
            sendEvent('tool_error', { name: tc.name, error: err.message })
          }
        }

        allToolCalls.push(...result.toolCalls)

        // Continue conversation with tool results
        messages = [
          ...messages,
          { role: 'assistant', content: result.toolCalls.map(tc => ({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })) },
          { role: 'user', content: toolResults }
        ]
      } else {
        continueLoop = false
      }

      // Track spend
      if (result.usage) {
        const costMillicents = Math.round(
          (result.usage.inputTokens * 0.003 + result.usage.outputTokens * 0.015) * 100
        )
        creds.trackSpend(cred.id, costMillicents)
        sendEvent('usage', result.usage)
      }
    }

    // Store assistant response
    session.addMessage(sid, 'assistant', fullResponse, allToolCalls.length > 0 ? allToolCalls : null)

    sendEvent('done', { sessionId: sid })
    res.end()

  } catch (err) {
    console.error('[chat] Error:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: err.message })
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`)
      res.end()
    }
  }
})

router.get('/sessions', (req, res) => {
  try {
    res.json(session.listSessions())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/sessions/:id', (req, res) => {
  try {
    const messages = session.getMessages(req.params.id)
    res.json(messages)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/sessions/:id', (req, res) => {
  try {
    session.deleteSession(req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

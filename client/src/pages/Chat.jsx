import React, { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../utils/api'
import { streamChat } from '../utils/sse'
import MessageBubble from '../components/MessageBubble'
import ToolCall from '../components/ToolCall'
import InterruptPrompt from '../components/InterruptPrompt'

export default function Chat({ token }) {
  const [sessions, setSessions] = useState([])
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [toolCalls, setToolCalls] = useState([]) // Current message's tool calls
  const [pendingInterrupts, setPendingInterrupts] = useState([])
  const messagesEndRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(() => {
    loadSessions()
    startInterruptPolling()
    return () => clearInterval(pollRef.current)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  async function loadSessions() {
    try {
      const data = await api.get('/chat/sessions', token)
      setSessions(data)
    } catch {}
  }

  async function loadSession(id) {
    try {
      const msgs = await api.get(`/chat/sessions/${id}`, token)
      setCurrentSessionId(id)
      setMessages(msgs)
      setStreamingText('')
      setToolCalls([])
    } catch {}
  }

  async function deleteSession(id) {
    try {
      await api.delete(`/chat/sessions/${id}`, token)
      if (id === currentSessionId) {
        setCurrentSessionId(null)
        setMessages([])
      }
      loadSessions()
    } catch {}
  }

  function startInterruptPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const interrupts = await api.get('/tools/interrupts/pending', token)
        setPendingInterrupts(interrupts)
      } catch {}
    }, 1000)
  }

  function handleInterruptResolved(id) {
    setPendingInterrupts(prev => prev.filter(i => i.id !== id))
  }

  async function handleSend(e) {
    e.preventDefault()
    const msg = input.trim()
    if (!msg || streaming) return

    setInput('')
    setStreaming(true)
    setStreamingText('')
    setToolCalls([])

    // Optimistically add user message
    const userMsg = { role: 'user', content: msg, createdAt: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])

    let sessionId = currentSessionId
    let fullText = ''

    try {
      await streamChat({
        message: msg,
        sessionId,
        token,
        onEvent: (event, data) => {
          if (event === 'session') {
            sessionId = data.sessionId
            setCurrentSessionId(data.sessionId)
          } else if (event === 'token') {
            fullText += data.token
            setStreamingText(fullText)
          } else if (event === 'tool_call') {
            setToolCalls(prev => [...prev, { ...data, result: null }])
          } else if (event === 'tool_result') {
            setToolCalls(prev => prev.map(tc =>
              tc.id === data.id ? { ...tc, result: data } : tc
            ))
          }
        }
      })

      // Reload full session to get accurate persisted messages
      if (sessionId) {
        const msgs = await api.get(`/chat/sessions/${sessionId}`, token)
        setMessages(msgs)
        loadSessions()
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.message}`,
        createdAt: new Date().toISOString()
      }])
    } finally {
      setStreaming(false)
      setStreamingText('')
      setToolCalls([])
    }
  }

  return (
    <div className="flex h-full">
      {/* Interrupt prompts (modal) */}
      {pendingInterrupts.map(interrupt => (
        <InterruptPrompt
          key={interrupt.id}
          interrupt={interrupt}
          token={token}
          onResolved={handleInterruptResolved}
        />
      ))}

      {/* Session list */}
      <div className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-3 border-b border-gray-800">
          <button
            onClick={() => { setCurrentSessionId(null); setMessages([]); setStreamingText('') }}
            className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
          >
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer text-xs ${
                s.id === currentSessionId ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              <div className="flex-1 truncate" onClick={() => loadSession(s.id)}>
                {s.title}
              </div>
              <button
                onClick={() => deleteSession(s.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && !streaming && (
            <div className="text-center text-gray-600 mt-16">
              <div className="text-4xl mb-3">⚡</div>
              <div className="text-lg text-gray-500">Kiaros is ready</div>
              <div className="text-sm mt-2">Ask anything or give a task to complete.</div>
              <div className="text-xs mt-4 text-gray-700">
                Tool calls require scope approval in the Tools page.
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={msg.id || i} message={msg} />
          ))}

          {/* Tool calls during streaming */}
          {toolCalls.length > 0 && (
            <div className="mb-3 ml-4">
              {toolCalls.map((tc, i) => (
                <ToolCall key={tc.id || i} call={tc} result={tc.result} />
              ))}
            </div>
          )}

          {/* Streaming text */}
          {streamingText && (
            <div className="flex justify-start mb-4">
              <div className="max-w-[80%] rounded-lg px-4 py-3 text-sm bg-gray-800 text-gray-100 border border-gray-700">
                <div className="text-xs text-gray-400 mb-1">Kiaros</div>
                <pre className="whitespace-pre-wrap font-sans break-words">{streamingText}</pre>
                <span className="animate-pulse">▍</span>
              </div>
            </div>
          )}

          {streaming && !streamingText && (
            <div className="flex justify-start mb-4">
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-400 text-sm">
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-800 p-3">
          <form onSubmit={handleSend} className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend(e)
                }
              }}
              placeholder="Message Kiaros... (Enter to send, Shift+Enter for newline)"
              disabled={streaming}
              rows={1}
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none disabled:opacity-50"
              style={{ minHeight: '38px', maxHeight: '120px' }}
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-sm font-semibold transition-colors"
            >
              {streaming ? '...' : '↑'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

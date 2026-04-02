import { useState, useRef, useEffect } from 'react'
import api from '../utils/api'

function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] rounded-xl px-4 py-3 ${
        isUser
          ? 'bg-kiaros-600 text-white'
          : 'bg-gray-800 text-gray-100'
      }`}>
        <pre className="whitespace-pre-wrap text-sm font-sans">{message.content}</pre>
      </div>
    </div>
  )
}

function ToolCallBanner({ name, status }) {
  const colors = {
    executing: 'text-yellow-400 bg-yellow-900/20 border-yellow-800',
    success: 'text-green-400 bg-green-900/20 border-green-800',
    error: 'text-red-400 bg-red-900/20 border-red-800',
    blocked: 'text-orange-400 bg-orange-900/20 border-orange-800'
  }
  return (
    <div className={`text-xs px-3 py-1.5 rounded-lg border mb-2 ${colors[status] || colors.executing}`}>
      Tool: {name} — {status}
    </div>
  )
}

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [sessions, setSessions] = useState([])
  const [toolEvents, setToolEvents] = useState([])
  const messagesEnd = useRef(null)

  useEffect(() => {
    api.listSessions().then(setSessions).catch(() => {})
  }, [])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, toolEvents])

  async function loadSession(id) {
    const msgs = await api.getSession(id)
    setMessages(msgs.map(m => ({ role: m.role, content: m.content })))
    setSessionId(id)
    setToolEvents([])
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)
    setToolEvents([])

    let assistantText = ''

    try {
      await api.streamChat(userMsg, sessionId, (event, data) => {
        switch (event) {
          case 'session':
            setSessionId(data.sessionId)
            break
          case 'text':
            assistantText += data.text
            setMessages(prev => {
              const msgs = [...prev]
              const lastMsg = msgs[msgs.length - 1]
              if (lastMsg?.role === 'assistant') {
                msgs[msgs.length - 1] = { role: 'assistant', content: assistantText }
              } else {
                msgs.push({ role: 'assistant', content: assistantText })
              }
              return msgs
            })
            break
          case 'tool_executing':
            setToolEvents(prev => [...prev, { name: data.name, status: 'executing' }])
            break
          case 'tool_result':
            setToolEvents(prev =>
              prev.map(t => t.name === data.name && t.status === 'executing'
                ? { ...t, status: 'success' }
                : t
              )
            )
            break
          case 'tool_error':
            setToolEvents(prev =>
              prev.map(t => t.name === data.name && t.status === 'executing'
                ? { ...t, status: 'error' }
                : t
              )
            )
            break
          case 'tool_blocked':
            setToolEvents(prev =>
              prev.map(t => t.name === data.name && t.status === 'executing'
                ? { ...t, status: 'blocked' }
                : t
              )
            )
            break
          case 'done':
            api.listSessions().then(setSessions).catch(() => {})
            break
        }
      })
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  function newSession() {
    setMessages([])
    setSessionId(null)
    setToolEvents([])
  }

  return (
    <div className="h-screen flex">
      {/* Sidebar */}
      <div className="w-48 bg-gray-900/50 border-r border-gray-800 p-3 flex flex-col">
        <button onClick={newSession} className="btn-primary text-sm mb-3 w-full">
          New Chat
        </button>
        <div className="flex-1 overflow-auto space-y-1">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => loadSession(s.id)}
              className={`block w-full text-left text-xs px-2 py-1.5 rounded truncate transition-colors ${
                s.id === sessionId ? 'bg-kiaros-600/20 text-kiaros-400' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              {s.title || 'Untitled'}
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-auto p-6">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-gray-600">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-500 mb-2">Kiaros</h2>
                <p className="text-sm">Ask anything. Tools will be used if approved.</p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}

          {toolEvents.map((evt, i) => (
            <ToolCallBanner key={i} name={evt.name} status={evt.status} />
          ))}

          {loading && (
            <div className="flex justify-start mb-4">
              <div className="bg-gray-800 rounded-xl px-4 py-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-kiaros-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-kiaros-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                  <div className="w-2 h-2 bg-kiaros-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEnd} />
        </div>

        <form onSubmit={handleSend} className="p-4 border-t border-gray-800">
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              disabled={loading}
              autoFocus
            />
            <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

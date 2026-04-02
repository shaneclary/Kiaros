const BASE = '/api'

function getToken() {
  return localStorage.getItem('kiaros_token')
}

function setToken(token) {
  localStorage.setItem('kiaros_token', token)
}

function clearToken() {
  localStorage.removeItem('kiaros_token')
}

function getPassphrase() {
  return sessionStorage.getItem('kiaros_pass')
}

function setPassphrase(pass) {
  sessionStorage.setItem('kiaros_pass', pass)
}

async function request(path, opts = {}) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  })

  if (res.status === 401) {
    clearToken()
    window.location.reload()
    throw new Error('Session expired')
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

function streamChat(message, sessionId, onEvent) {
  const token = getToken()
  const passphrase = getPassphrase()

  return new Promise((resolve, reject) => {
    fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ message, sessionId, passphrase })
    }).then(res => {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      function read() {
        reader.read().then(({ done, value }) => {
          if (done) {
            resolve()
            return
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop()

          let eventName = null
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventName = line.slice(7)
            } else if (line.startsWith('data: ') && eventName) {
              try {
                const data = JSON.parse(line.slice(6))
                onEvent(eventName, data)
              } catch { /* skip malformed */ }
              eventName = null
            }
          }

          read()
        }).catch(reject)
      }

      read()
    }).catch(reject)
  })
}

const api = {
  getToken, setToken, clearToken, getPassphrase, setPassphrase,

  // Auth
  getStatus: () => request('/auth/status'),
  setup: (passphrase) => request('/auth/setup', { method: 'POST', body: { passphrase } }),
  login: (passphrase) => request('/auth/login', { method: 'POST', body: { passphrase } }),
  logout: () => request('/auth/logout', { method: 'POST' }),

  // Credentials
  listCredentials: () => request('/credentials'),
  addCredential: (label, apiKey, passphrase, model) =>
    request('/credentials', { method: 'POST', body: { label, apiKey, passphrase, model } }),
  deleteCredential: (id) => request(`/credentials/${id}`, { method: 'DELETE' }),
  testCredential: (id) => request(`/credentials/${id}/test`, { method: 'POST', body: { passphrase: getPassphrase() } }),

  // Chat
  streamChat,
  listSessions: () => request('/chat/sessions'),
  getSession: (id) => request(`/chat/sessions/${id}`),
  deleteSession: (id) => request(`/chat/sessions/${id}`, { method: 'DELETE' }),

  // Tools
  listTools: () => request('/tools'),
  getScopes: () => request('/tools/scopes'),
  approveScopes: (toolId, scopes) =>
    request(`/tools/${toolId}/approve`, { method: 'POST', body: { scopes } }),
  revokeScopes: (toolId) => request(`/tools/${toolId}/approve`, { method: 'DELETE' }),

  // Memory
  getWorkingMemory: () => request('/memory/working'),
  setMemory: (key, value) => request(`/memory/working/${key}`, { method: 'PUT', body: { value } }),
  deleteMemory: (key) => request(`/memory/working/${key}`, { method: 'DELETE' }),

  // Audit
  getAuditLog: (limit, offset) => request(`/audit?limit=${limit || 50}&offset=${offset || 0}`),
  undoAction: (id) => request(`/audit/${id}/undo`, { method: 'POST' }),

  // Tick Engine
  getTickStatus: () => request('/tick/status'),
  startTick: () => request('/tick/start', { method: 'POST' }),
  stopTick: () => request('/tick/stop', { method: 'POST' }),
  triggerTick: () => request('/tick/trigger', { method: 'POST' }),
  getTickLog: (limit) => request(`/tick/log?limit=${limit || 20}`),
  updateTickConfig: (cfg) => request('/tick/config', { method: 'PUT', body: cfg }),

  // Tasks
  listTasks: (status) => request(`/tick/tasks${status ? `?status=${status}` : ''}`),
  createTask: (title, description, steps, priority) =>
    request('/tick/tasks', { method: 'POST', body: { title, description, steps, priority } }),
  advanceTask: (id, result) => request(`/tick/tasks/${id}/advance`, { method: 'POST', body: { result } }),
  pauseTask: (id, reason) => request(`/tick/tasks/${id}/pause`, { method: 'POST', body: { reason } }),
  resumeTask: (id) => request(`/tick/tasks/${id}/resume`, { method: 'POST' }),
  deleteTask: (id) => request(`/tick/tasks/${id}`, { method: 'DELETE' }),

  // Settings
  getSettings: () => request('/settings'),
  updateSettings: (settings) => request('/settings', { method: 'PUT', body: settings }),

  // Interrupts
  getInterrupts: () => request('/settings/interrupts'),
  resolveInterrupt: (id, approved) =>
    request(`/settings/interrupts/${id}/resolve`, { method: 'POST', body: { approved } }),
}

export default api

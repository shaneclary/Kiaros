const express = require('express')
const path = require('path')
const { getDb } = require('./db/client')
const { registerTool } = require('./tools/registry')
const scheduler = require('./scheduler/manager')

const PORT = process.env.PORT || 3333

// Initialize DB and run migrations
getDb()

// Register built-in tools on startup (INSERT OR IGNORE — safe to call multiple times)
const builtins = [
  {
    id: 'file-reader',
    name: 'File Reader',
    description: 'Read the contents of a file from your local filesystem',
    requiredScopes: ['fs:read'],
    reversible: false,
    sandboxed: true,
    timeoutMs: 5000
  },
  {
    id: 'file-writer',
    name: 'File Writer',
    description: 'Write or edit files on your local filesystem',
    requiredScopes: ['fs:write'],
    reversible: true,
    sandboxed: true,
    timeoutMs: 5000
  },
  {
    id: 'web-fetch',
    name: 'Web Fetch',
    description: 'Fetch content from a URL (HTTPS GET requests only)',
    requiredScopes: ['net:fetch'],
    reversible: false,
    sandboxed: true,
    timeoutMs: 10000
  },
  {
    id: 'note-taker',
    name: 'Note Taker',
    description: 'Save notes to the notes/ directory',
    requiredScopes: ['fs:write'],
    reversible: true,
    sandboxed: true,
    timeoutMs: 5000
  },
  {
    id: 'shell-exec',
    name: 'Shell Command',
    description: 'Execute a shell command and return its stdout/stderr output',
    requiredScopes: ['shell:exec'],
    reversible: false,
    sandboxed: false,
    timeoutMs: 30000
  },
  {
    id: 'clipboard-read',
    name: 'Read Clipboard',
    description: 'Read the current text content of the system clipboard (Wayland/X11)',
    requiredScopes: ['fs:read'],
    reversible: false,
    sandboxed: true,
    timeoutMs: 8000
  },
  {
    id: 'clipboard-write',
    name: 'Write Clipboard',
    description: 'Overwrite the system clipboard with the provided text (Wayland/X11)',
    requiredScopes: ['fs:write'],
    reversible: false,
    sandboxed: true,
    timeoutMs: 8000
  }
]

for (const tool of builtins) {
  registerTool(tool)
}

const app = express()

// Security middleware
app.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'no-referrer')
  // Content Security Policy — only allow localhost
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'")
  next()
})

// Body parsing — 10MB limit to prevent DoS
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Basic rate limiting for auth endpoints
const authAttempts = new Map()
function authRateLimit(req, res, next) {
  const ip = req.ip || 'local'
  const now = Date.now()
  const windowMs = 15 * 60 * 1000 // 15 minutes
  const maxAttempts = 20

  if (!authAttempts.has(ip)) {
    authAttempts.set(ip, [])
  }

  const attempts = authAttempts.get(ip).filter(t => now - t < windowMs)
  attempts.push(now)
  authAttempts.set(ip, attempts)

  if (attempts.length > maxAttempts) {
    return res.status(429).json({ error: 'Too many auth attempts. Please wait 15 minutes.' })
  }

  next()
}

// API Routes
app.use('/api/auth', authRateLimit, require('./routes/auth'))
app.use('/api/credentials', require('./routes/credentials'))
app.use('/api/chat', require('./routes/chat'))
app.use('/api/tools', require('./routes/tools'))
app.use('/api/memory', require('./routes/memory'))
app.use('/api/audit', require('./routes/audit'))
app.use('/api/settings', require('./routes/settings'))
app.use('/api/scheduler', require('./routes/scheduler'))

// Serve built React app
const publicDir = path.join(__dirname, 'public')
app.use(express.static(publicDir))

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' })
  }
  const indexPath = path.join(publicDir, 'index.html')
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(500).send('Frontend not built. Run: cd client && npm install && npm run build')
    }
  })
})

// Global error handler — sanitize errors
app.use((err, req, res, next) => {
  console.error('[Error]', err.message)
  // Never expose stack traces or sensitive data
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\nKiaros 2.0 running at http://localhost:${PORT}`)
  console.log('All traffic is local. External calls only to api.anthropic.com.')
  console.log('Press Ctrl+C to stop.\n')
  scheduler.start()
})

module.exports = app

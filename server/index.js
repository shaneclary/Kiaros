const express = require('express')
const cors = require('cors')
const path = require('path')
const config = require('./config')
const { getDb, close } = require('./db/client')
const { seedBuiltinTools } = require('./tools/registry')
const tickEngine = require('./tick/engine')

const app = express()

// Middleware
app.use(cors())
app.use(express.json({ limit: '1mb' }))

// API Routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/credentials', require('./routes/credentials'))
app.use('/api/chat', require('./routes/chat'))
app.use('/api/tools', require('./routes/tools'))
app.use('/api/memory', require('./routes/memory'))
app.use('/api/audit', require('./routes/audit'))
app.use('/api/tick', require('./routes/tick'))
app.use('/api/settings', require('./routes/settings'))

// Serve React frontend
const clientDist = path.join(__dirname, '..', 'client', 'dist')
app.use(express.static(clientDist))
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDist, 'index.html'))
  }
})

// Initialize
const PORT = config.get('port') || process.env.PORT || 3333

function startup() {
  // Initialize database
  getDb()
  console.log('[kiaros] Database initialized')

  // Seed built-in tools
  seedBuiltinTools()
  console.log('[kiaros] Built-in tools registered')

  // Start tick engine if enabled
  if (config.get('tick')?.enabled) {
    tickEngine.start()
  }

  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║           KIAROS v2.0.0                   ║
║   AI Orchestration Engine                 ║
║                                           ║
║   → http://localhost:${PORT}                ║
║                                           ║
║   Security-first • Proactive • Open       ║
╚═══════════════════════════════════════════╝
    `)
  })
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[kiaros] Shutting down...')
  tickEngine.stop()
  close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  tickEngine.stop()
  close()
  process.exit(0)
})

startup()

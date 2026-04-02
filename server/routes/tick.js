const express = require('express')
const { requireAuth } = require('../auth/passphrase')
const tickEngine = require('../tick/engine')
const tasks = require('../tick/tasks')
const config = require('../config')

const router = express.Router()
router.use(requireAuth)

// --- Tick Engine ---

router.get('/status', (req, res) => {
  res.json(tickEngine.getStatus())
})

router.post('/start', (req, res) => {
  config.set('tick', { ...config.get('tick'), enabled: true })
  const started = tickEngine.start()
  res.json({ success: true, started })
})

router.post('/stop', (req, res) => {
  config.set('tick', { ...config.get('tick'), enabled: false })
  tickEngine.stop()
  res.json({ success: true })
})

router.post('/trigger', async (req, res) => {
  try {
    const result = await tickEngine.tick()
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/log', (req, res) => {
  const limit = parseInt(req.query.limit) || 20
  res.json(tickEngine.getRecentTicks(limit))
})

router.put('/config', (req, res) => {
  const allowed = ['enabled', 'intervalMs', 'maxAutonomousRisk', 'idleThresholdMs']
  const current = config.get('tick') || {}
  const updates = {}
  for (const key of Object.keys(req.body)) {
    if (allowed.includes(key)) updates[key] = req.body[key]
  }
  if (updates.intervalMs !== undefined) {
    updates.intervalMs = Math.min(Math.max(parseInt(updates.intervalMs) || 60000, 10000), 3600000)
  }
  if (updates.idleThresholdMs !== undefined) {
    updates.idleThresholdMs = Math.min(Math.max(parseInt(updates.idleThresholdMs) || 300000, 30000), 7200000)
  }
  if (updates.maxAutonomousRisk && !['low', 'medium', 'high'].includes(updates.maxAutonomousRisk)) {
    return res.status(400).json({ error: 'Invalid risk level. Must be: low, medium, high' })
  }
  config.set('tick', { ...current, ...updates })
  res.json({ success: true, tick: config.get('tick') })
})

// --- Tasks ---

router.get('/tasks', (req, res) => {
  const status = req.query.status
  if (status) {
    const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'paused']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` })
    }
  }
  res.json(status ? tasks.getByStatus(status) : tasks.listAll())
})

router.post('/tasks', (req, res) => {
  try {
    const { title, description, steps, priority } = req.body
    if (!title) return res.status(400).json({ error: 'Missing title' })
    const clampedPriority = Math.min(Math.max(parseInt(priority) || 0, 0), 100)
    const id = tasks.create(title, description, steps || [], null, clampedPriority)
    res.json({ success: true, id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/tasks/:id', (req, res) => {
  const task = tasks.get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Not found' })
  res.json(task)
})

router.put('/tasks/:id/status', (req, res) => {
  try {
    const { status } = req.body
    const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'paused']
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` })
    }
    tasks.updateStatus(req.params.id, status)
    res.json({ success: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/tasks/:id/advance', (req, res) => {
  try {
    const result = tasks.advanceStep(req.params.id, req.body.result || null)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/tasks/:id/pause', (req, res) => {
  try {
    tasks.pause(req.params.id, req.body.reason)
    res.json({ success: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/tasks/:id/resume', (req, res) => {
  try {
    tasks.resume(req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.delete('/tasks/:id', (req, res) => {
  try {
    tasks.remove(req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

const express = require('express')
const router = express.Router()
const { requireAuth } = require('../auth/passphrase')
const { getAllMemory, getMemory, setMemory, deleteMemory } = require('../memory/working')

router.use(requireAuth)

// GET /api/memory/working
router.get('/working', (req, res) => {
  try {
    res.json(getAllMemory())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/memory/working/:key
router.put('/working/:key', (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key)
    const { value, source } = req.body
    if (value === undefined) return res.status(400).json({ error: 'value is required' })
    setMemory(key, String(value), source || 'user_stated')
    res.json({ ok: true, entry: getMemory(key) })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/memory/working/:key
router.delete('/working/:key', (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key)
    deleteMemory(key)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/memory/search — Semantic search (Phase 6 placeholder)
router.post('/search', (req, res) => {
  res.status(501).json({ error: 'Semantic search not yet implemented (Phase 6)' })
})

module.exports = router

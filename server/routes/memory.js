const express = require('express')
const router = express.Router()
const { requireAuth } = require('../auth/passphrase')
const { getAllMemory, getMemory, setMemory, deleteMemory } = require('../memory/working')
const { searchArchive, isVectorSearchAvailable } = require('../memory/archive')

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

// GET /api/memory/archive/status — Check if vector search is available
router.get('/archive/status', (req, res) => {
  res.json({ vectorSearch: isVectorSearchAvailable() })
})

// POST /api/memory/search — Keyword or vector search over archive
router.post('/search', (req, res) => {
  try {
    const { query, limit } = req.body
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required' })
    }
    if (query.length > 1000) {
      return res.status(400).json({ error: 'query too long (max 1000 chars)' })
    }
    const results = searchArchive({ query, limit: Math.min(limit || 10, 50) })
    res.json({
      results,
      mode: isVectorSearchAvailable() ? 'vector' : 'keyword'
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

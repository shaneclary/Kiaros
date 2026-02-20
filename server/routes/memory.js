const express = require('express')
const router = express.Router()
const { requireAuth } = require('../auth/passphrase')
const { getAllMemory, getMemory, setMemory, deleteMemory } = require('../memory/working')
const { searchArchive, isSemanticSearchAvailable } = require('../memory/archive')
const { reflectOnSession } = require('../memory/reflection')
const { getDecryptedKey, getActiveCredentialId, listCredentials } = require('../credentials/manager')

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

// GET /api/memory/archive/status
router.get('/archive/status', (req, res) => {
  res.json({ semanticSearch: isSemanticSearchAvailable(), vectorSearch: isSemanticSearchAvailable() })
})

// POST /api/memory/search — Semantic or keyword search over archive
router.post('/search', async (req, res) => {
  try {
    const { query, limit } = req.body
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required' })
    }
    if (query.length > 1000) {
      return res.status(400).json({ error: 'query too long (max 1000 chars)' })
    }
    const results = await searchArchive({ query, limit: Math.min(limit || 10, 50) })
    res.json({
      results,
      mode: isSemanticSearchAvailable() ? 'semantic' : 'keyword'
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/memory/reflect/:sessionId — Run post-session reflection
router.post('/reflect/:sessionId', async (req, res) => {
  try {
    const { credentialId } = req.body
    const activeCredId = credentialId || getActiveCredentialId()
    if (!activeCredId) {
      return res.status(400).json({ error: 'No API key configured' })
    }

    let apiKey
    try {
      apiKey = getDecryptedKey(activeCredId, req.encKey)
    } catch {
      return res.status(400).json({ error: 'Failed to retrieve API key' })
    }

    // Always use haiku for reflection — structured extraction, not heavy reasoning
    const model = 'claude-haiku-4-20250514'

    try {
      const result = await reflectOnSession(req.params.sessionId, apiKey, model)
      res.json(result)
    } finally {
      apiKey = null
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

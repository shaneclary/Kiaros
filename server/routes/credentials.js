const express = require('express')
const router = express.Router()
const { requireAuth } = require('../auth/passphrase')
const {
  addCredential, listCredentials, getCredential,
  deleteCredential, updateCredential, getDecryptedKey
} = require('../credentials/manager')
const { testApiKey } = require('../models/anthropic')

// All credential routes require auth. requireAuth sets req.encKey (in-memory
// passphrase-derived key — NEVER log or forward to clients).
router.use(requireAuth)

// GET /api/credentials — list with masked keys
router.get('/', (req, res) => {
  try {
    res.json(listCredentials())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/credentials — add new, encrypted with session encKey
router.post('/', (req, res) => {
  try {
    const { label, apiKey, model, monthlyBudgetCents } = req.body
    if (!label) return res.status(400).json({ error: 'label is required' })
    if (!apiKey) return res.status(400).json({ error: 'apiKey is required' })
    if (!apiKey.startsWith('sk-')) return res.status(400).json({ error: 'Invalid API key format' })

    const cred = addCredential({ label, apiKey, model, monthlyBudgetCents }, req.encKey)
    res.status(201).json(cred)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/credentials/:id/test — decrypt and ping Anthropic to validate
router.post('/:id/test', async (req, res) => {
  let apiKey
  try {
    apiKey = getDecryptedKey(req.params.id, req.encKey)
    // SECURITY: apiKey must never be logged or sent in responses
    const result = await testApiKey(apiKey)
    res.json(result)
  } catch (err) {
    // Sanitize error: ensure API key doesn't appear in message
    const safeMsg = err.message.replace(/sk-ant-[^\s]*/g, '***')
    res.status(400).json({ error: safeMsg })
  } finally {
    // Help GC clear the plaintext key sooner
    apiKey = null
  }
})

// PUT /api/credentials/:id — update metadata (not the key itself)
router.put('/:id', (req, res) => {
  try {
    const { label, model, monthlyBudgetCents } = req.body
    updateCredential(req.params.id, { label, model, monthlyBudgetCents })
    res.json(getCredential(req.params.id))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/credentials/:id
router.delete('/:id', (req, res) => {
  try {
    deleteCredential(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router

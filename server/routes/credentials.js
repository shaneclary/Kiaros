const express = require('express')
const router = express.Router()
const { requireAuth } = require('../auth/passphrase')
const {
  addCredential, listCredentials, getCredential,
  deleteCredential, updateCredential, getDecryptedKey, getActiveCredentialId
} = require('../credentials/manager')
const { testApiKey } = require('../models/anthropic')
const config = require('../config')

// All credential routes require auth
router.use(requireAuth)

// GET /api/credentials
router.get('/', (req, res) => {
  try {
    const creds = listCredentials()
    res.json(creds)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/credentials
router.post('/', (req, res) => {
  try {
    const { label, apiKey, model, monthlyBudgetCents } = req.body
    if (!label) return res.status(400).json({ error: 'label is required' })
    if (!apiKey) return res.status(400).json({ error: 'apiKey is required' })
    if (!apiKey.startsWith('sk-')) return res.status(400).json({ error: 'Invalid API key format' })

    // We need the passphrase to encrypt — store it from login
    // For simplicity in single-user mode, use a derived key from the server secret
    const serverSecret = getServerSecret()

    const cred = addCredential({ label, apiKey, model, monthlyBudgetCents }, serverSecret)
    res.status(201).json(cred)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/credentials/:id/test — Validate API key
router.post('/:id/test', async (req, res) => {
  try {
    const serverSecret = getServerSecret()
    const apiKey = getDecryptedKey(req.params.id, serverSecret)
    // SECURITY: never log apiKey
    const result = await testApiKey(apiKey)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PUT /api/credentials/:id
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

/**
 * Get server encryption secret.
 * In production this should be derived from the user's passphrase,
 * but for single-user simplicity we use a per-installation secret stored in config.
 */
function getServerSecret() {
  let secret = config.get('serverSecret')
  if (!secret) {
    const crypto = require('crypto')
    secret = crypto.randomBytes(32).toString('hex')
    config.set('serverSecret', secret)
  }
  return secret
}

// Export for use in chat route
module.exports = router
module.exports.getServerSecret = getServerSecret

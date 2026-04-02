const express = require('express')
const { requireAuth } = require('../auth/passphrase')
const creds = require('../credentials/manager')
const anthropic = require('../models/anthropic')

const router = express.Router()
router.use(requireAuth)

router.get('/', (req, res) => {
  try {
    const list = creds.listCredentials()
    res.json(list)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', (req, res) => {
  try {
    const { label, apiKey, passphrase, model } = req.body
    if (!label || !apiKey || !passphrase) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    const id = creds.addCredential(label, apiKey, passphrase, model)
    res.json({ success: true, id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', (req, res) => {
  try {
    creds.deleteCredential(req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', (req, res) => {
  try {
    creds.updateCredential(req.params.id, req.body)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/test', async (req, res) => {
  try {
    const { passphrase } = req.body
    if (!passphrase) return res.status(400).json({ error: 'Passphrase required' })
    const cred = creds.getActiveCredential(passphrase)
    if (!cred) return res.status(404).json({ error: 'No active credential' })
    const result = await anthropic.testConnection(cred.apiKey)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

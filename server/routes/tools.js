const express = require('express')
const { requireAuth } = require('../auth/passphrase')
const { listTools, approveScopes, revokeScopes } = require('../tools/registry')
const { SCOPES } = require('../tools/scopes')

const router = express.Router()
router.use(requireAuth)

router.get('/', (req, res) => {
  try {
    res.json(listTools())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/scopes', (req, res) => {
  res.json(SCOPES)
})

router.post('/:id/approve', (req, res) => {
  try {
    const { scopes } = req.body
    if (!scopes || !Array.isArray(scopes)) {
      return res.status(400).json({ error: 'Scopes must be an array' })
    }
    approveScopes(req.params.id, scopes)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id/approve', (req, res) => {
  try {
    revokeScopes(req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

const express = require('express')
const { requireAuth } = require('../auth/passphrase')
const working = require('../memory/working')

const router = express.Router()
router.use(requireAuth)

router.get('/working', (req, res) => {
  try {
    res.json(working.getAll())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/working/:key', (req, res) => {
  try {
    const key = req.params.key
    if (!/^[a-zA-Z0-9_\-. ]+$/.test(key) || key.length > 128) {
      return res.status(400).json({ error: 'Invalid key. Use alphanumeric, underscore, hyphen, dot, space (max 128 chars)' })
    }
    const { value, source } = req.body
    if (!value) return res.status(400).json({ error: 'Missing value' })
    working.set(key, value, source || 'user_stated')
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/working/:key', (req, res) => {
  try {
    working.remove(req.params.key)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

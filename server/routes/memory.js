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
    const { value, source } = req.body
    if (!value) return res.status(400).json({ error: 'Missing value' })
    working.set(req.params.key, value, source || 'user_stated')
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

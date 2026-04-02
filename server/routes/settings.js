const express = require('express')
const { requireAuth } = require('../auth/passphrase')
const config = require('../config')
const { resolveInterrupt, getPendingInterrupts } = require('../orchestration/interrupt-gate')

const router = express.Router()
router.use(requireAuth)

router.get('/', (req, res) => {
  const all = config.getAll()
  // Never expose passphraseHash
  const { passphraseHash, ...safe } = all
  res.json(safe)
})

router.put('/', (req, res) => {
  try {
    const allowed = ['interruptMode', 'defaultModel', 'tick']
    for (const key of Object.keys(req.body)) {
      if (allowed.includes(key)) {
        config.set(key, req.body[key])
      }
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Interrupt management
router.get('/interrupts', (req, res) => {
  res.json(getPendingInterrupts())
})

router.post('/interrupts/:id/resolve', (req, res) => {
  try {
    const { approved } = req.body
    resolveInterrupt(req.params.id, approved)
    res.json({ success: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router

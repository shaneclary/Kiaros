const express = require('express')
const router = express.Router()
const { setPassphrase, hasPassphrase, login, logout } = require('../auth/passphrase')
const config = require('../config')

// POST /api/auth/setup — First-run passphrase setup
router.post('/setup', async (req, res) => {
  try {
    if (hasPassphrase()) {
      return res.status(400).json({ error: 'Passphrase already set. Use login.' })
    }
    const { passphrase } = req.body
    if (!passphrase) return res.status(400).json({ error: 'passphrase is required' })
    await setPassphrase(passphrase)
    res.json({ ok: true, message: 'Passphrase set. You can now log in.' })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { passphrase } = req.body
    if (!passphrase) return res.status(400).json({ error: 'passphrase is required' })
    const token = await login(passphrase)
    res.json({ token })
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token) logout(token)
  res.json({ ok: true })
})

// GET /api/auth/status — Check if passphrase is set, used by frontend
router.get('/status', (req, res) => {
  res.json({
    firstRun: !hasPassphrase(),
    hasPassphrase: hasPassphrase()
  })
})

module.exports = router

const express = require('express')
const { setPassphrase, login, logout } = require('../auth/passphrase')
const config = require('../config')

const router = express.Router()

router.post('/setup', async (req, res) => {
  try {
    if (!config.get('firstRun')) {
      return res.status(400).json({ error: 'Setup already completed' })
    }
    const { passphrase } = req.body
    if (!passphrase || passphrase.length < 8) {
      return res.status(400).json({ error: 'Passphrase must be at least 8 characters' })
    }
    await setPassphrase(passphrase)
    const token = await login(passphrase)
    res.json({ success: true, token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { passphrase } = req.body
    const token = await login(passphrase)
    res.json({ success: true, token })
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
})

router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  logout(token)
  res.json({ success: true })
})

router.get('/status', (req, res) => {
  res.json({
    firstRun: config.get('firstRun'),
    version: '2.0.0'
  })
})

module.exports = router

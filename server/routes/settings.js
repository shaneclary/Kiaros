const express = require('express')
const router = express.Router()
const { requireAuth } = require('../auth/passphrase')
const config = require('../config')

router.use(requireAuth)

const ALLOWED_INTERRUPT_MODES = ['confirm', 'smart', 'auto']
const ALLOWED_PROVIDERS = ['anthropic', 'ollama']

// GET /api/settings
router.get('/', (req, res) => {
  try {
    const settings = config.getAll()
    // Omit sensitive fields
    const { passphraseHash, serverSecret, ...safe } = settings
    res.json(safe)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/settings
router.put('/', (req, res) => {
  try {
    const { interruptMode, provider, ollamaModel, theme } = req.body

    if (interruptMode !== undefined) {
      if (!ALLOWED_INTERRUPT_MODES.includes(interruptMode)) {
        return res.status(400).json({ error: `interruptMode must be one of: ${ALLOWED_INTERRUPT_MODES.join(', ')}` })
      }
      config.set('interruptMode', interruptMode)
    }

    if (provider !== undefined) {
      if (!ALLOWED_PROVIDERS.includes(provider)) {
        return res.status(400).json({ error: `provider must be one of: ${ALLOWED_PROVIDERS.join(', ')}` })
      }
      config.set('provider', provider)
    }

    if (ollamaModel !== undefined) {
      if (typeof ollamaModel !== 'string' || ollamaModel.length > 100) {
        return res.status(400).json({ error: 'Invalid ollamaModel' })
      }
      config.set('ollamaModel', ollamaModel)
    }

    if (theme !== undefined) {
      if (!['light', 'dark'].includes(theme)) {
        return res.status(400).json({ error: 'theme must be light or dark' })
      }
      config.set('theme', theme)
    }

    const settings = config.getAll()
    const { passphraseHash, serverSecret, ...safe } = settings
    res.json(safe)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router

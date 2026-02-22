const express = require('express')
const router = express.Router()
const { requireAuth } = require('../auth/passphrase')
const { getDb } = require('../db/client')
const { randomUUID } = require('crypto')

router.use(requireAuth)

// POST /api/push/register — store a device push token
// Body: { platform: 'android'|'ios', token: string, deviceName?: string }
router.post('/register', (req, res) => {
  try {
    const { platform, token, deviceName } = req.body
    if (!platform || !['android', 'ios'].includes(platform)) {
      return res.status(400).json({ error: 'platform must be "android" or "ios"' })
    }
    if (!token || typeof token !== 'string' || token.length < 10) {
      return res.status(400).json({ error: 'token is required' })
    }

    const db = getDb()
    const id = randomUUID()

    // INSERT OR REPLACE so re-registrations on the same device update the record
    db.prepare(`
      INSERT INTO push_tokens (id, platform, token, device_name)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET
        platform    = excluded.platform,
        device_name = excluded.device_name
    `).run(id, platform, token, deviceName || null)

    res.json({ ok: true, registered: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/push/unregister — remove a device push token
// Body: { token: string }
router.delete('/unregister', (req, res) => {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ error: 'token is required' })

    const db = getDb()
    const result = db.prepare('DELETE FROM push_tokens WHERE token = ?').run(token)
    res.json({ ok: true, removed: result.changes > 0 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/push/tokens — list registered devices (admin view)
router.get('/tokens', (req, res) => {
  try {
    const db = getDb()
    const tokens = db.prepare(`
      SELECT id, platform, device_name, created_at FROM push_tokens ORDER BY created_at DESC
    `).all()
    res.json(tokens)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

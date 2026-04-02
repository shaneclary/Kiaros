const express = require('express')
const { requireAuth } = require('../auth/passphrase')
const audit = require('../audit/logger')

const router = express.Router()
router.use(requireAuth)

router.get('/', (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 500)
    const offset = Math.max(parseInt(req.query.offset) || 0, 0)
    res.json(audit.getAuditLog(limit, offset))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', (req, res) => {
  try {
    const entry = audit.getAuditEntry(req.params.id)
    if (!entry) return res.status(404).json({ error: 'Not found' })
    res.json(entry)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/undo', (req, res) => {
  try {
    const undoData = audit.undoAction(req.params.id)
    res.json({ success: true, undoData })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router

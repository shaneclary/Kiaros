const express = require('express')
const router = express.Router()
const { requireAuth } = require('../auth/passphrase')
const { getAuditLog, getAuditEntry, markReversed } = require('../audit/logger')
const fs = require('fs').promises

router.use(requireAuth)

// GET /api/audit — Paginated audit log
router.get('/', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const sessionId = req.query.sessionId || undefined

    const entries = getAuditLog({ page, limit, sessionId })
    res.json({ page, limit, entries })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/audit/:id
router.get('/:id', (req, res) => {
  try {
    const entry = getAuditEntry(req.params.id)
    if (!entry) return res.status(404).json({ error: 'Entry not found' })
    res.json(entry)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/audit/:id/undo — Undo a reversible action
router.post('/:id/undo', async (req, res) => {
  try {
    const entry = getAuditEntry(req.params.id)
    if (!entry) return res.status(404).json({ error: 'Entry not found' })
    if (!entry.reversible) return res.status(400).json({ error: 'Action is not reversible' })
    if (entry.reversed) return res.status(400).json({ error: 'Action already reversed' })

    const undoData = entry.undoData
    if (!undoData) return res.status(400).json({ error: 'No undo data available' })

    // Perform undo based on tool
    if (entry.tool_id === 'file-writer' || entry.tool_id === 'note-taker') {
      if (undoData.previouslyExisted) {
        await fs.writeFile(undoData.path, undoData.previousContent, 'utf-8')
      } else {
        await fs.unlink(undoData.path).catch(() => {}) // File may have been deleted already
      }
    } else {
      return res.status(400).json({ error: `Undo not implemented for tool: ${entry.tool_id}` })
    }

    markReversed(entry.id)
    res.json({ ok: true, message: 'Action reversed successfully' })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router

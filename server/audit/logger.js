const crypto = require('crypto')
const { getDb } = require('../db/client')

function logAction(data) {
  const db = getDb()
  const id = crypto.randomUUID()

  db.prepare(`
    INSERT INTO audit_log (
      id, session_id, tool_id, tool_name, input,
      approved_by, reversible, undo_data, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id,
    data.sessionId || null,
    data.toolId || null,
    data.toolName || null,
    data.input ? JSON.stringify(data.input) : null,
    data.approvedBy || 'auto',
    data.reversible ? 1 : 0,
    data.undoData ? JSON.stringify(data.undoData) : null
  )

  return id
}

function updateAction(id, result) {
  const db = getDb()
  db.prepare(`
    UPDATE audit_log
    SET output = ?, duration_ms = ?, token_cost = ?, error = ?
    WHERE id = ?
  `).run(
    result.output ? JSON.stringify(result.output) : null,
    result.durationMs || null,
    result.tokenCost || null,
    result.error || null,
    id
  )
}

function getAuditLog(limit = 50, offset = 0) {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset)
}

function getAuditEntry(id) {
  const db = getDb()
  return db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id)
}

function undoAction(id) {
  const db = getDb()
  const entry = db.prepare('SELECT * FROM audit_log WHERE id = ? AND reversible = 1 AND reversed = 0').get(id)
  if (!entry) throw new Error('Action not found or not reversible')
  db.prepare('UPDATE audit_log SET reversed = 1 WHERE id = ?').run(id)
  return JSON.parse(entry.undo_data)
}

module.exports = { logAction, updateAction, getAuditLog, getAuditEntry, undoAction }

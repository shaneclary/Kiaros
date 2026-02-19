const crypto = require('crypto')
const { getDb } = require('../db/client')

/**
 * Log an action BEFORE execution (status: pending implied by no output)
 * @param {{ sessionId?, toolId, toolName, input, approvedBy?, reversible?, undoData? }} data
 * @returns {string} audit log entry id
 */
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
    data.toolName,
    JSON.stringify(data.input || {}),
    data.approvedBy || 'auto',
    data.reversible ? 1 : 0,
    data.undoData ? JSON.stringify(data.undoData) : null
  )

  return id
}

/**
 * Update audit log entry after execution completes
 * @param {string} id - entry id
 * @param {{ output?, durationMs?, tokenCost?, error? }} result
 */
function updateAction(id, result) {
  const db = getDb()

  db.prepare(`
    UPDATE audit_log
    SET output = ?, duration_ms = ?, token_cost = ?, error = ?
    WHERE id = ?
  `).run(
    result.output !== undefined ? JSON.stringify(result.output) : null,
    result.durationMs || null,
    result.tokenCost || null,
    result.error || null,
    id
  )
}

/**
 * Mark an action as reversed (for undo)
 * @param {string} id
 */
function markReversed(id) {
  const db = getDb()
  db.prepare('UPDATE audit_log SET reversed = 1 WHERE id = ?').run(id)
}

/**
 * Get paginated audit log
 * @param {{ page?: number, limit?: number, sessionId?: string }} opts
 */
function getAuditLog({ page = 1, limit = 50, sessionId } = {}) {
  const db = getDb()
  const offset = (page - 1) * limit

  let query = 'SELECT * FROM audit_log'
  const params = []

  if (sessionId) {
    query += ' WHERE session_id = ?'
    params.push(sessionId)
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const rows = db.prepare(query).all(...params)

  // Parse JSON fields
  return rows.map(row => ({
    ...row,
    input: tryParse(row.input),
    output: tryParse(row.output),
    undoData: tryParse(row.undo_data),
    reversible: !!row.reversible,
    reversed: !!row.reversed
  }))
}

/**
 * Get single audit entry
 */
function getAuditEntry(id) {
  const db = getDb()
  const row = db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id)
  if (!row) return null
  return {
    ...row,
    input: tryParse(row.input),
    output: tryParse(row.output),
    undoData: tryParse(row.undo_data),
    reversible: !!row.reversible,
    reversed: !!row.reversed
  }
}

function tryParse(str) {
  if (!str) return null
  try { return JSON.parse(str) } catch { return str }
}

module.exports = { logAction, updateAction, markReversed, getAuditLog, getAuditEntry }

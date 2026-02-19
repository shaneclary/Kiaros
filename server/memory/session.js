const crypto = require('crypto')
const { getDb } = require('../db/client')

/**
 * Create a new conversation session
 */
function createSession(title) {
  const db = getDb()
  const id = crypto.randomUUID()
  db.prepare(`
    INSERT INTO sessions (id, title) VALUES (?, ?)
  `).run(id, title || `Session ${new Date().toLocaleString()}`)
  return id
}

/**
 * Get all sessions
 */
function listSessions() {
  const db = getDb()
  return db.prepare('SELECT * FROM sessions ORDER BY last_active_at DESC').all().map(s => ({
    id: s.id,
    title: s.title,
    startedAt: s.started_at,
    lastActiveAt: s.last_active_at
  }))
}

/**
 * Get messages for a session
 */
function getMessages(sessionId) {
  const db = getDb()
  return db.prepare(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC'
  ).all(sessionId).map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at
  }))
}

/**
 * Append a message to a session
 */
function addMessage(sessionId, role, content) {
  const db = getDb()
  const id = crypto.randomUUID()

  db.prepare(`
    INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)
  `).run(id, sessionId, role, content)

  // Update session last_active_at
  db.prepare(`UPDATE sessions SET last_active_at = datetime('now') WHERE id = ?`).run(sessionId)

  return id
}

/**
 * Delete a session and all its messages
 */
function deleteSession(sessionId) {
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
}

/**
 * Update session title based on first message
 */
function updateSessionTitle(sessionId, title) {
  const db = getDb()
  db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, sessionId)
}

module.exports = {
  createSession,
  listSessions,
  getMessages,
  addMessage,
  deleteSession,
  updateSessionTitle
}

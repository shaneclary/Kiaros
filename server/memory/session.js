const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db/client')

function createSession(title) {
  const db = getDb()
  const id = uuidv4()
  db.prepare('INSERT INTO sessions (id, title) VALUES (?, ?)').run(id, title || 'New Session')
  return id
}

function getSession(id) {
  const db = getDb()
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
}

function listSessions(limit = 20) {
  const db = getDb()
  return db.prepare('SELECT * FROM sessions ORDER BY last_active_at DESC LIMIT ?').all(limit)
}

function deleteSession(id) {
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

function touchSession(id) {
  const db = getDb()
  db.prepare("UPDATE sessions SET last_active_at = datetime('now') WHERE id = ?").run(id)
}

function addMessage(sessionId, role, content, toolCalls) {
  const db = getDb()
  const id = uuidv4()
  db.prepare(`
    INSERT INTO messages (id, session_id, role, content, tool_calls)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, sessionId, role, content, toolCalls ? JSON.stringify(toolCalls) : null)
  touchSession(sessionId)
  return id
}

function getMessages(sessionId, limit = 100) {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?
  `).all(sessionId, limit)
}

function getContextWindow(sessionId, maxMessages = 50) {
  const messages = getMessages(sessionId, maxMessages)
  return messages.map(m => ({
    role: m.role,
    content: m.content
  }))
}

module.exports = {
  createSession, getSession, listSessions, deleteSession,
  addMessage, getMessages, getContextWindow, touchSession
}

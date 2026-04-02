const { getDb } = require('../db/client')

function getAll() {
  const db = getDb()
  return db.prepare('SELECT * FROM working_memory ORDER BY updated_at DESC').all()
}

function get(key) {
  const db = getDb()
  return db.prepare('SELECT * FROM working_memory WHERE key = ?').get(key)
}

function set(key, value, source = 'user_stated') {
  const db = getDb()
  db.prepare(`
    INSERT INTO working_memory (key, value, source, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = ?, source = ?, updated_at = datetime('now')
  `).run(key, value, source, value, source)
}

function remove(key) {
  const db = getDb()
  db.prepare('DELETE FROM working_memory WHERE key = ?').run(key)
}

function toContextString() {
  const all = getAll()
  if (all.length === 0) return ''
  const lines = all.map(m => `- ${m.key}: ${m.value}`)
  return `[Working Memory]\n${lines.join('\n')}`
}

module.exports = { getAll, get, set, remove, toContextString }

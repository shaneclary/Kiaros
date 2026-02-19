const { getDb } = require('../db/client')

/**
 * Get all working memory entries
 * @returns {Array<{ key, value, source, createdAt, updatedAt }>}
 */
function getAllMemory() {
  const db = getDb()
  return db.prepare('SELECT * FROM working_memory ORDER BY updated_at DESC').all().map(row => ({
    key: row.key,
    value: row.value,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }))
}

/**
 * Get a single memory value by key
 */
function getMemory(key) {
  const db = getDb()
  return db.prepare('SELECT * FROM working_memory WHERE key = ?').get(key)
}

/**
 * Set a memory key-value pair
 */
function setMemory(key, value, source = 'user_stated') {
  if (!key || typeof key !== 'string') throw new Error('Memory key must be a non-empty string')
  if (key.length > 255) throw new Error('Memory key too long (max 255 chars)')
  if (typeof value !== 'string') throw new Error('Memory value must be a string')
  if (value.length > 10000) throw new Error('Memory value too long (max 10000 chars)')

  const db = getDb()
  db.prepare(`
    INSERT INTO working_memory (key, value, source, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      source = excluded.source,
      updated_at = datetime('now')
  `).run(key, value, source)
}

/**
 * Delete a memory key
 */
function deleteMemory(key) {
  const db = getDb()
  db.prepare('DELETE FROM working_memory WHERE key = ?').run(key)
}

/**
 * Build a memory context string for Claude system prompt
 */
function buildMemoryContext() {
  const memories = getAllMemory()
  if (memories.length === 0) return ''

  const lines = memories.map(m => `- ${m.key}: ${m.value}`)
  return `\n\nWorking Memory (user-provided context):\n${lines.join('\n')}`
}

module.exports = { getAllMemory, getMemory, setMemory, deleteMemory, buildMemoryContext }

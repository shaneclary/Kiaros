/**
 * Kiaros Semantic Memory Archive (Phase 6)
 *
 * Provides vector-similarity search over archived conversations and notes.
 * Uses the sqlite-vec extension for embedding storage and ANN search.
 *
 * Status: sqlite-vec requires native compilation. This module exports a
 * functional stub that degrades gracefully when the extension is unavailable,
 * falling back to keyword search (LIKE) over the working_memory table.
 *
 * To enable full vector search:
 *   npm install sqlite-vec
 *   # or build from source: https://github.com/asg017/sqlite-vec
 *
 * The API is kept stable so the caller doesn't need to know which mode is active.
 */

const { getDb } = require('../db/client')

let sqliteVec = null
let vectorsEnabled = false

// Attempt to load sqlite-vec extension
try {
  sqliteVec = require('sqlite-vec')
  const db = getDb()
  sqliteVec.load(db)
  // Create vector table if not exists
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_archive USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[1536]
    );
    CREATE TABLE IF NOT EXISTS memory_archive_meta (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'conversation',
      session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  vectorsEnabled = true
  console.log('[memory/archive] sqlite-vec loaded — vector search enabled')
} catch {
  console.log('[memory/archive] sqlite-vec not available — using keyword fallback')
}

/**
 * Store a text chunk in the archive.
 * With sqlite-vec: generates and stores a vector embedding.
 * Without sqlite-vec: stores as plain text for keyword search.
 *
 * @param {{ id?: string, content: string, source?: string, sessionId?: string, embedding?: number[] }} opts
 */
function archiveChunk({ id, content, source, sessionId, embedding }) {
  const crypto = require('crypto')
  const db = getDb()
  const chunkId = id || crypto.randomUUID()

  if (vectorsEnabled && embedding) {
    db.prepare(`
      INSERT OR REPLACE INTO memory_archive_meta (id, content, source, session_id)
      VALUES (?, ?, ?, ?)
    `).run(chunkId, content, source || 'conversation', sessionId || null)

    // Store embedding as binary float array
    const floatBuf = Buffer.alloc(embedding.length * 4)
    embedding.forEach((v, i) => floatBuf.writeFloatLE(v, i * 4))

    db.prepare(`
      INSERT OR REPLACE INTO memory_archive (id, embedding)
      VALUES (?, ?)
    `).run(chunkId, floatBuf)
  } else {
    // Keyword-only fallback: store in working_memory with archive_ prefix
    db.prepare(`
      INSERT OR REPLACE INTO working_memory (key, value, source, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(`archive_${chunkId}`, content, source || 'conversation')
  }

  return chunkId
}

/**
 * Search the archive.
 *
 * With sqlite-vec: ANN (approximate nearest neighbour) vector search.
 * Without sqlite-vec: case-insensitive keyword LIKE search over working_memory.
 *
 * @param {{ query: string, embedding?: number[], limit?: number }} opts
 * @returns {Array<{ id: string, content: string, score: number, source: string }>}
 */
function searchArchive({ query, embedding, limit = 10 }) {
  const db = getDb()

  if (vectorsEnabled && embedding) {
    // ANN search via sqlite-vec
    const floatBuf = Buffer.alloc(embedding.length * 4)
    embedding.forEach((v, i) => floatBuf.writeFloatLE(v, i * 4))

    const rows = db.prepare(`
      SELECT a.id, m.content, m.source, a.distance AS score
      FROM memory_archive a
      JOIN memory_archive_meta m ON a.id = m.id
      WHERE a.embedding MATCH ?
        AND k = ?
      ORDER BY a.distance
    `).all(floatBuf, limit)

    return rows.map(r => ({
      id: r.id,
      content: r.content,
      source: r.source,
      score: 1 - r.score  // convert distance to similarity
    }))
  }

  // Keyword fallback
  const rows = db.prepare(`
    SELECT key AS id, value AS content, source
    FROM working_memory
    WHERE key LIKE 'archive_%'
      AND value LIKE ?
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(`%${query}%`, limit)

  return rows.map(r => ({
    id: r.id.replace('archive_', ''),
    content: r.content,
    source: r.source,
    score: 0.5  // keyword match — no real score
  }))
}

/**
 * Delete a single archive entry by id.
 */
function deleteArchiveEntry(id) {
  const db = getDb()
  if (vectorsEnabled) {
    db.prepare('DELETE FROM memory_archive WHERE id = ?').run(id)
    db.prepare('DELETE FROM memory_archive_meta WHERE id = ?').run(id)
  } else {
    db.prepare('DELETE FROM working_memory WHERE key = ?').run(`archive_${id}`)
  }
}

/**
 * Whether vector search is currently available.
 */
function isVectorSearchAvailable() {
  return vectorsEnabled
}

module.exports = {
  archiveChunk,
  searchArchive,
  deleteArchiveEntry,
  isVectorSearchAvailable
}

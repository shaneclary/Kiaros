/**
 * Kiaros Semantic Memory Archive
 *
 * Three-tier search strategy, tried in order:
 *   1. sqlite-vec ANN search    (if extension loaded + embedding available)
 *   2. JS cosine similarity     (if Ollama embedding available, no sqlite-vec)
 *   3. Keyword LIKE fallback    (always works)
 *
 * Embeddings come from Ollama's nomic-embed-text model (free, local).
 * The module probes Ollama at startup and sets ollamaEmbeddingAvailable.
 * All callers should treat archiveChunk / searchArchive as async.
 */

const crypto = require('crypto')
const { getDb } = require('../db/client')

// ── Constants ─────────────────────────────────────────────────────────────
const OLLAMA_URL  = 'http://localhost:11434'
const EMBED_MODEL = 'nomic-embed-text'

// ── State flags ───────────────────────────────────────────────────────────
let sqliteVec                = null
let vectorTableEnabled       = false  // sqlite-vec loaded and vec table ready
let ollamaEmbeddingAvailable = false  // Ollama embed endpoint responding

// ── Ensure meta table always exists (even without sqlite-vec) ─────────────
function ensureMetaTable() {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_archive_meta (
      id             TEXT PRIMARY KEY,
      content        TEXT NOT NULL,
      source         TEXT NOT NULL DEFAULT 'conversation',
      session_id     TEXT,
      embedding_json TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

// ── Try loading sqlite-vec ────────────────────────────────────────────────
try {
  sqliteVec = require('sqlite-vec')
  const db = getDb()
  sqliteVec.load(db)
  ensureMetaTable()
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_archive_vec USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[768]
    );
  `)
  vectorTableEnabled = true
  console.log('[memory/archive] sqlite-vec loaded — ANN vector search available')
} catch {
  try { ensureMetaTable() } catch {}
  console.log('[memory/archive] sqlite-vec not available — using semantic or keyword fallback')
}

// ── Probe Ollama embedding endpoint at startup (non-blocking) ─────────────
;(async () => {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: 'test' }),
      signal: AbortSignal.timeout(4000)
    })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data.embedding) && data.embedding.length > 0) {
        ollamaEmbeddingAvailable = true
        console.log(`[memory/archive] Ollama ${EMBED_MODEL} available — semantic search enabled`)
      }
    }
  } catch {
    // Ollama not running — keyword fallback will be used
  }
})()

// ── Embedding helpers ──────────────────────────────────────────────────────

/**
 * Request an embedding vector from Ollama.
 * @param {string} text
 * @returns {Promise<number[]|null>}
 */
async function generateEmbedding(text) {
  if (!ollamaEmbeddingAvailable) return null
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text.substring(0, 2000) }),
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data.embedding) ? data.embedding : null
  } catch {
    return null
  }
}

/**
 * Cosine similarity between two equal-length float arrays → 0..1
 */
function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot  += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB)
  return mag > 0 ? dot / mag : 0
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Store a text chunk in the archive (async).
 *
 * @param {{ id?, content, source?, sessionId? }} opts
 * @returns {Promise<string>} chunkId
 */
async function archiveChunk({ id, content, source, sessionId }) {
  const db = getDb()
  const chunkId = id || crypto.randomUUID()
  const embedding = await generateEmbedding(content)

  if (embedding) {
    db.prepare(`
      INSERT OR REPLACE INTO memory_archive_meta
        (id, content, source, session_id, embedding_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(chunkId, content, source || 'conversation', sessionId || null, JSON.stringify(embedding))

    if (vectorTableEnabled) {
      const floatBuf = Buffer.alloc(embedding.length * 4)
      embedding.forEach((v, i) => floatBuf.writeFloatLE(v, i * 4))
      db.prepare('INSERT OR REPLACE INTO memory_archive_vec (id, embedding) VALUES (?, ?)').run(chunkId, floatBuf)
    }
  } else {
    // Keyword fallback: store in working_memory with archive_ prefix
    db.prepare(`
      INSERT OR REPLACE INTO working_memory (key, value, source, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(`archive_${chunkId}`, content, source || 'conversation')
  }

  return chunkId
}

/**
 * Search the archive (async).
 *
 * Tier 1 — sqlite-vec ANN  (fastest)
 * Tier 2 — JS cosine scan  (no sqlite-vec, but Ollama available)
 * Tier 3 — keyword LIKE    (no embeddings at all)
 *
 * @param {{ query, limit? }} opts
 * @returns {Promise<Array<{ id, content, score, source }>>}
 */
async function searchArchive({ query, limit = 10 }) {
  const db = getDb()
  const safeLimit = Math.min(limit, 50)
  const embedding = await generateEmbedding(query)

  // Tier 1: sqlite-vec ANN
  if (vectorTableEnabled && embedding) {
    try {
      const floatBuf = Buffer.alloc(embedding.length * 4)
      embedding.forEach((v, i) => floatBuf.writeFloatLE(v, i * 4))
      const rows = db.prepare(`
        SELECT v.id, m.content, m.source, v.distance AS dist
        FROM memory_archive_vec v
        JOIN memory_archive_meta m ON v.id = m.id
        WHERE v.embedding MATCH ? AND k = ?
        ORDER BY v.distance
      `).all(floatBuf, safeLimit)
      return rows.map(r => ({ id: r.id, content: r.content, source: r.source, score: Math.max(0, 1 - r.dist) }))
    } catch {
      // Fall through to tier 2
    }
  }

  // Tier 2: JS cosine over meta table
  if (embedding) {
    const rows = db.prepare(
      'SELECT id, content, source, embedding_json FROM memory_archive_meta WHERE embedding_json IS NOT NULL'
    ).all()

    return rows
      .map(r => {
        try {
          const vec = JSON.parse(r.embedding_json)
          return { id: r.id, content: r.content, source: r.source, score: cosineSimilarity(embedding, vec) }
        } catch { return null }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit)
  }

  // Tier 3: keyword LIKE
  const rows = db.prepare(`
    SELECT key AS id, value AS content, source
    FROM working_memory
    WHERE key LIKE 'archive_%' AND value LIKE ?
    ORDER BY updated_at DESC LIMIT ?
  `).all(`%${query}%`, safeLimit)

  return rows.map(r => ({
    id: r.id.replace('archive_', ''),
    content: r.content,
    source: r.source,
    score: 0.5
  }))
}

/**
 * Delete a single archive entry by id.
 */
function deleteArchiveEntry(id) {
  const db = getDb()
  if (vectorTableEnabled) {
    db.prepare('DELETE FROM memory_archive_vec  WHERE id = ?').run(id)
  }
  db.prepare('DELETE FROM memory_archive_meta WHERE id = ?').run(id)
  db.prepare('DELETE FROM working_memory WHERE key = ?').run(`archive_${id}`)
}

function isSemanticSearchAvailable() { return ollamaEmbeddingAvailable || vectorTableEnabled }
function isVectorSearchAvailable()   { return isSemanticSearchAvailable() }

module.exports = {
  archiveChunk,
  searchArchive,
  deleteArchiveEntry,
  generateEmbedding,
  isSemanticSearchAvailable,
  isVectorSearchAvailable,
}

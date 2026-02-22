/**
 * Kiaros Document Ingestion Pipeline
 *
 * Orchestrates: stat → parse → chunk → embed → index
 *
 * Document index lives in the SQLite DB (document_index table).
 * Chunks are stored in memory_archive_meta with source='document' and doc_id.
 *
 * Public API:
 *   ingestFile(filePath)   → { docId, filename, chunkCount, skipped? }
 *   removeDocument(docId)  → { chunkCount }
 *   listDocuments()        → DocumentRow[]
 *   getDocument(docId)     → DocumentRow | null
 *   getDocumentByPath(p)   → DocumentRow | null
 */

'use strict'

const crypto = require('crypto')
const path   = require('path')
const fs     = require('fs')

const { getDb }              = require('../db/client')
const { parseFile }          = require('./parser')
const { chunkText }          = require('./chunker')
const { archiveChunk, removeDocumentChunks } = require('../memory/archive')

// ── Schema migration ───────────────────────────────────────────────────────
function ensureDocumentTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS document_index (
      id          TEXT PRIMARY KEY,
      file_path   TEXT NOT NULL UNIQUE,
      filename    TEXT NOT NULL,
      mime_type   TEXT,
      size_bytes  INTEGER,
      chunk_count INTEGER DEFAULT 0,
      mtime       TEXT,
      indexed_at  TEXT NOT NULL DEFAULT (datetime('now')),
      error       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_document_index_path
      ON document_index(file_path);
  `)
}

try { ensureDocumentTable() } catch (e) {
  console.error('[ingestion/pipeline] schema init error:', e.message)
}

// ── Helpers ────────────────────────────────────────────────────────────────
function rowToDoc(r) {
  if (!r) return null
  return {
    id:         r.id,
    filePath:   r.file_path,
    filename:   r.filename,
    mimeType:   r.mime_type,
    sizeBytes:  r.size_bytes,
    chunkCount: r.chunk_count,
    mtime:      r.mtime,
    indexedAt:  r.indexed_at,
    error:      r.error || null,
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Ingest a file: parse → chunk → embed and store in archive.
 *
 * If the file's mtime matches the existing index entry, returns { skipped: true }.
 *
 * @param {string} filePath  Absolute path
 * @returns {Promise<{ docId, filename, chunkCount, skipped? }>}
 */
async function ingestFile(filePath) {
  const db       = getDb()
  const filename = path.basename(filePath)

  // Stat
  let stat
  try { stat = fs.statSync(filePath) } catch (err) {
    throw new Error(`Cannot stat file: ${err.message}`)
  }
  const mtime = stat.mtime.toISOString()

  // Check existing entry
  const existing = db.prepare('SELECT * FROM document_index WHERE file_path = ?').get(filePath)

  if (existing && existing.mtime === mtime && !existing.error) {
    return { docId: existing.id, filename, chunkCount: existing.chunk_count, skipped: true }
  }

  const docId = existing ? existing.id : crypto.randomUUID()

  // If re-indexing, remove old chunks first
  if (existing) {
    removeDocumentChunks(docId)
  }

  // Parse
  let parsed
  try {
    parsed = parseFile(filePath)
  } catch (err) {
    // Record error in index, return partial result
    db.prepare(`
      INSERT OR REPLACE INTO document_index
        (id, file_path, filename, mime_type, size_bytes, chunk_count, mtime, indexed_at, error)
      VALUES (?, ?, ?, NULL, ?, 0, ?, datetime('now'), ?)
    `).run(docId, filePath, filename, stat.size, mtime, err.message)
    throw err
  }

  // Chunk
  const chunks = chunkText(parsed.text)

  // Embed + archive each chunk
  let archived = 0
  for (const chunk of chunks) {
    try {
      await archiveChunk({
        content:   chunk.text,
        source:    'document',
        docId,
      })
      archived++
    } catch {
      // Individual chunk failure — continue
    }
  }

  // Upsert document_index
  db.prepare(`
    INSERT OR REPLACE INTO document_index
      (id, file_path, filename, mime_type, size_bytes, chunk_count, mtime, indexed_at, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), NULL)
  `).run(docId, filePath, filename, parsed.mimeType, stat.size, archived, mtime)

  console.log(`[ingestion] indexed ${filename}: ${archived}/${chunks.length} chunks (docId=${docId})`)
  return { docId, filename, chunkCount: archived }
}

/**
 * Remove a document and all its archive chunks from the index.
 *
 * @param {string} docId
 * @returns {{ chunkCount: number }}
 */
function removeDocument(docId) {
  const count = removeDocumentChunks(docId)
  getDb().prepare('DELETE FROM document_index WHERE id = ?').run(docId)
  return { chunkCount: count }
}

/** List all indexed documents, most recently indexed first. */
function listDocuments() {
  return getDb()
    .prepare('SELECT * FROM document_index ORDER BY indexed_at DESC')
    .all()
    .map(rowToDoc)
}

/** Get a single document by id. */
function getDocument(docId) {
  return rowToDoc(getDb().prepare('SELECT * FROM document_index WHERE id = ?').get(docId))
}

/** Get a single document by absolute file path. */
function getDocumentByPath(filePath) {
  return rowToDoc(getDb().prepare('SELECT * FROM document_index WHERE file_path = ?').get(filePath))
}

module.exports = { ingestFile, removeDocument, listDocuments, getDocument, getDocumentByPath }

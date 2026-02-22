/**
 * Unified Search (Phase 14)
 *
 * Single endpoint that fans out across every memory source in parallel and
 * returns merged, ranked results.
 *
 * Sources
 * ───────
 *   archive   — semantic search via Ollama embeddings / cosine similarity
 *   memory    — LIKE query across working_memory key + value
 *   sessions  — LIKE query across message content, joined to session title
 *   notes     — full-text scan of note files in XDG data dir
 *   jobs      — LIKE query across scheduled job result summaries
 *
 * GET /api/search?q=text[&sources=archive,memory][&limit=10]
 *
 * Response:
 *   { query, sources, total, results: [{ id, type, source, content, score, meta }] }
 */

const express  = require('express')
const router   = express.Router()
const fs       = require('fs').promises
const path     = require('path')
const { requireAuth } = require('../auth/passphrase')
const { searchArchive } = require('../memory/archive')
const { getDb }  = require('../db/client')
const xdg        = require('../xdg')

router.use(requireAuth)

const ALL_SOURCES   = ['archive', 'memory', 'sessions', 'notes', 'jobs', 'documents']
const DEFAULT_LIMIT = 10
const MAX_LIMIT     = 50

// GET /api/search
router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q)            return res.status(400).json({ error: 'q is required' })
  if (q.length > 500) return res.status(400).json({ error: 'q too long (max 500 chars)' })

  const rawSources = req.query.sources
    ? req.query.sources.split(',').map(s => s.trim()).filter(s => ALL_SOURCES.includes(s))
    : ALL_SOURCES
  const limit = Math.min(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, MAX_LIMIT)

  // Fan out to all requested sources in parallel
  const settled = await Promise.allSettled(
    rawSources.map(source => runSearch(source, q, limit).then(items => ({ source, items })))
  )

  // Flatten, tag with source, sort by score desc
  const all = []
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      for (const item of result.value.items) {
        all.push({ ...item, source: result.value.source })
      }
    }
  }
  all.sort((a, b) => b.score - a.score)

  res.json({
    query:   q,
    sources: rawSources,
    total:   all.length,
    results: all.slice(0, limit)
  })
})

// ── Per-source search functions ────────────────────────────────────────────

async function runSearch(source, q, limit) {
  switch (source) {
    case 'archive':  return searchArchive({ query: q, limit })
                           .then(rows => rows.map(r => ({ ...r, type: 'archive' })))
    case 'memory':   return searchMemory(q, limit)
    case 'sessions': return searchSessions(q, limit)
    case 'notes':    return searchNotes(q, limit)
    case 'jobs':      return searchJobs(q, limit)
    case 'documents': return searchDocuments(q, limit)
    default:          return []
  }
}

function searchMemory(q, limit) {
  const rows = getDb().prepare(`
    SELECT key, value, source, updated_at
    FROM working_memory
    WHERE key NOT LIKE 'archive_%'
      AND (key LIKE ? OR value LIKE ?)
    ORDER BY updated_at DESC LIMIT ?
  `).all(`%${q}%`, `%${q}%`, limit)

  return rows.map(r => ({
    id:      r.key,
    type:    'memory',
    content: `${r.key}: ${r.value}`,
    score:   0.4,
    meta:    { key: r.key, source: r.source, updatedAt: r.updated_at }
  }))
}

function searchSessions(q, limit) {
  const rows = getDb().prepare(`
    SELECT m.id, m.role, m.content, m.created_at,
           s.id AS session_id, s.title AS session_title
    FROM messages m
    JOIN sessions s ON m.session_id = s.id
    WHERE m.content LIKE ?
    ORDER BY m.created_at DESC LIMIT ?
  `).all(`%${q}%`, limit)

  return rows.map(r => ({
    id:      r.id,
    type:    'message',
    content: r.content.substring(0, 400),
    score:   0.5,
    meta:    {
      sessionId:    r.session_id,
      sessionTitle: r.session_title,
      role:         r.role,
      createdAt:    r.created_at
    }
  }))
}

async function searchNotes(q, limit) {
  let files
  try {
    files = await fs.readdir(xdg.notesDir)
  } catch {
    return []
  }

  // Only scan text-like files
  files = files.filter(f => /\.(md|txt|note|text)$/i.test(f))

  const results = []
  const lq = q.toLowerCase()

  for (const file of files) {
    if (results.length >= limit) break
    try {
      // Read at most 64 KB to avoid huge scans
      const raw  = await fs.readFile(path.join(xdg.notesDir, file), 'utf-8')
      const text = raw.substring(0, 65536)
      const idx  = text.toLowerCase().indexOf(lq)
      if (idx === -1) continue

      const snippet = text.substring(Math.max(0, idx - 120), idx + 280).trim()
      results.push({
        id:      file,
        type:    'note',
        content: snippet,
        score:   0.45,
        meta:    { filename: file, filePath: path.join(xdg.notesDir, file) }
      })
    } catch {
      // Unreadable file — skip silently
    }
  }

  return results
}

function searchJobs(q, limit) {
  const rows = getDb().prepare(`
    SELECT id, name, last_result_summary, last_run_at
    FROM scheduled_jobs
    WHERE last_result_summary LIKE ?
    ORDER BY last_run_at DESC LIMIT ?
  `).all(`%${q}%`, limit)

  return rows.map(r => ({
    id:      r.id,
    type:    'job_result',
    content: (r.last_result_summary || '').substring(0, 400),
    score:   0.35,
    meta:    { jobName: r.name, lastRunAt: r.last_run_at }
  }))
}

function searchDocuments(q, limit) {
  // LIKE search over indexed document chunks, joined to document_index for metadata
  const rows = getDb().prepare(`
    SELECT m.id, m.content, m.doc_id, m.created_at,
           d.filename, d.file_path, d.mime_type
    FROM memory_archive_meta m
    LEFT JOIN document_index d ON d.id = m.doc_id
    WHERE m.source = 'document'
      AND m.doc_id IS NOT NULL
      AND m.content LIKE ?
    ORDER BY m.created_at DESC LIMIT ?
  `).all(`%${q}%`, limit)

  return rows.map(r => {
    const idx  = (r.content || '').toLowerCase().indexOf(q.toLowerCase())
    const snip = idx >= 0
      ? r.content.substring(Math.max(0, idx - 80), idx + 300).trim()
      : r.content.substring(0, 280)
    return {
      id:      r.id,
      type:    'document_chunk',
      content: snip,
      score:   0.55,
      meta:    {
        docId:    r.doc_id,
        filename: r.filename  || '(unknown)',
        filePath: r.file_path || null,
        mimeType: r.mime_type || null,
      }
    }
  })
}

module.exports = router

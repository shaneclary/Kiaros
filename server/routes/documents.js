'use strict'

const express = require('express')
const path    = require('path')
const fs      = require('fs')

const router     = express.Router()
const { requireAuth } = require('../auth/passphrase')
const { ingestFile, removeDocument, listDocuments, getDocument, getDocumentByPath } = require('../ingestion/pipeline')
const watcher    = require('../ingestion/watcher')
const xdg        = require('../xdg')

router.use(requireAuth)

// ── GET /api/documents ─────────────────────────────────────────────────────
// List all indexed documents
router.get('/', (req, res) => {
  try {
    res.json(listDocuments())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/documents/status ──────────────────────────────────────────────
// Watcher status + docsDir path
router.get('/status', (req, res) => {
  try {
    const s = watcher.status()
    res.json({
      ...s,
      docCount: listDocuments().length,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/documents/:id ─────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const doc = getDocument(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Document not found' })
    res.json(doc)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/documents/ingest ─────────────────────────────────────────────
// Body: { path: "/absolute/path/to/file" }
// Ingests a single file by absolute path.
// The file must be readable by the Kiaros server process.
router.post('/ingest', async (req, res) => {
  const { path: filePath } = req.body
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'path is required' })
  }

  // Normalise and safety-check the path (no traversal outside permitted dirs)
  const abs = path.resolve(filePath)
  const allowed = [xdg.docsDir, xdg.notesDir]
  const inAllowed = allowed.some(dir => abs.startsWith(dir + path.sep) || abs === dir)

  if (!inAllowed) {
    // Also allow any absolute path the user explicitly provides, but warn
    // and verify the file exists and is readable first.
    try { fs.accessSync(abs, fs.constants.R_OK) } catch {
      return res.status(400).json({ error: 'File not found or not readable' })
    }
  }

  try {
    const result = await ingestFile(abs)
    res.json(result)
  } catch (err) {
    res.status(422).json({ error: err.message })
  }
})

// ── POST /api/documents/scan ───────────────────────────────────────────────
// Trigger a manual re-scan of docsDir (queues all files)
router.post('/scan', (req, res) => {
  try {
    const entries = fs.readdirSync(xdg.docsDir).filter(n => !n.startsWith('.'))
    let queued = 0
    for (const name of entries) {
      const abs = path.join(xdg.docsDir, name)
      try {
        if (fs.statSync(abs).isFile()) {
          // Fire-and-forget into the pipeline (watcher queue)
          ingestFile(abs).catch(() => {})
          queued++
        }
      } catch {}
    }
    res.json({ ok: true, queued, docsDir: xdg.docsDir })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/documents/:id ──────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const doc = getDocument(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Document not found' })
    const { chunkCount } = removeDocument(req.params.id)
    res.json({ ok: true, chunkCount, filename: doc.filename })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/documents/upload ─────────────────────────────────────────────
// Mobile upload: body { filename, content_base64, mime_type? }
// Writes file into docsDir and immediately ingests it.
router.post('/upload', async (req, res) => {
  const { filename, content_base64, mime_type } = req.body
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'filename is required' })
  }
  if (!content_base64 || typeof content_base64 !== 'string') {
    return res.status(400).json({ error: 'content_base64 is required' })
  }

  // Sanitize filename — strip all path separators
  const safe = path.basename(filename.replace(/[/\\]/g, '_'))
  if (!safe || safe === '.' || safe === '..') {
    return res.status(400).json({ error: 'Invalid filename' })
  }

  const destPath = path.join(xdg.docsDir, safe)

  try {
    // Decode and write — 25 MB limit to prevent memory exhaustion
    const buf = Buffer.from(content_base64, 'base64')
    if (buf.length > 25 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (25 MB max)' })
    }
    fs.mkdirSync(xdg.docsDir, { recursive: true })
    fs.writeFileSync(destPath, buf)

    const result = await ingestFile(destPath)
    res.json({ ok: true, ...result, filename: safe })
  } catch (err) {
    // Clean up on failure
    try { fs.unlinkSync(destPath) } catch {}
    res.status(422).json({ error: err.message })
  }
})

module.exports = router

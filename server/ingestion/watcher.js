/**
 * Kiaros Document Watcher
 *
 * Watches xdg.docsDir for new or changed files and queues them through the
 * ingestion pipeline.  Deleted files are removed from the document index.
 *
 * Behaviour:
 *   - On start():  full directory scan, ingests anything not yet indexed or
 *                  changed since last index.
 *   - fs.watch:    debounces 1 s per file path; change → ingest, rename
 *                  (unlink) → remove.
 *   - Queue:       serial async queue (1 worker) so Ollama isn't flooded.
 *
 * Public API:
 *   start()  → void (idempotent)
 *   stop()   → void
 *   status() → { running, queueDepth, docsDir, watchedFiles }
 */

'use strict'

const fs   = require('fs')
const path = require('path')
const xdg  = require('../xdg')
const { ingestFile, getDocumentByPath, removeDocument } = require('./pipeline')

const DEBOUNCE_MS  = 1000   // 1 s debounce per path
const SKIP_PATTERN = /^[._]/ // skip hidden / dot-files

// ── State ──────────────────────────────────────────────────────────────────
let watcher    = null
let running    = false
const debounce = new Map()   // filePath → timeout handle
const queue    = []          // [{ op: 'ingest'|'remove', filePath }]
let processing = false

// ── Queue worker ───────────────────────────────────────────────────────────
async function processNext() {
  if (processing || queue.length === 0) return
  processing = true
  const item = queue.shift()
  try {
    if (item.op === 'ingest') {
      await ingestFile(item.filePath)
    } else if (item.op === 'remove') {
      const doc = getDocumentByPath(item.filePath)
      if (doc) {
        removeDocument(doc.id)
        console.log(`[watcher] removed index for deleted file: ${path.basename(item.filePath)}`)
      }
    }
  } catch (err) {
    console.error(`[watcher] ${item.op} error for ${item.filePath}: ${err.message}`)
  }
  processing = false
  setImmediate(processNext)
}

function enqueue(op, filePath) {
  // Deduplicate: replace any pending same-path entry
  const idx = queue.findIndex(q => q.filePath === filePath)
  if (idx !== -1) queue.splice(idx, 1)
  queue.push({ op, filePath })
  setImmediate(processNext)
}

// ── Debounce helper ────────────────────────────────────────────────────────
function scheduleIngest(filePath) {
  if (debounce.has(filePath)) clearTimeout(debounce.get(filePath))
  debounce.set(filePath, setTimeout(() => {
    debounce.delete(filePath)
    try {
      const stat = fs.statSync(filePath)
      if (stat.isFile()) enqueue('ingest', filePath)
    } catch {
      // File disappeared between event and timeout — treat as removal
      enqueue('remove', filePath)
    }
  }, DEBOUNCE_MS))
}

function scheduleRemove(filePath) {
  if (debounce.has(filePath)) clearTimeout(debounce.get(filePath))
  debounce.set(filePath, setTimeout(() => {
    debounce.delete(filePath)
    enqueue('remove', filePath)
  }, DEBOUNCE_MS))
}

// ── Initial scan ───────────────────────────────────────────────────────────
function initialScan() {
  let entries
  try { entries = fs.readdirSync(xdg.docsDir) } catch { return }

  for (const name of entries) {
    if (SKIP_PATTERN.test(name)) continue
    const filePath = path.join(xdg.docsDir, name)
    try {
      if (fs.statSync(filePath).isFile()) enqueue('ingest', filePath)
    } catch {}
  }
  console.log(`[watcher] initial scan: ${entries.length} entries in ${xdg.docsDir}`)
}

// ── fs.watch handler ──────────────────────────────────────────────────────
function onFsEvent(eventType, filename) {
  if (!filename || SKIP_PATTERN.test(filename)) return
  const filePath = path.join(xdg.docsDir, filename)

  if (eventType === 'rename') {
    // rename fires for both create and delete
    try {
      fs.accessSync(filePath)   // exists → treat as create/change
      scheduleIngest(filePath)
    } catch {
      scheduleRemove(filePath)  // doesn't exist → deleted
    }
  } else {
    scheduleIngest(filePath)    // 'change'
  }
}

// ── Public API ─────────────────────────────────────────────────────────────
function start() {
  if (running) return
  running = true
  initialScan()

  try {
    watcher = fs.watch(xdg.docsDir, { persistent: false }, onFsEvent)
    watcher.on('error', err => {
      console.error('[watcher] fs.watch error:', err.message)
    })
    console.log(`[watcher] watching ${xdg.docsDir}`)
  } catch (err) {
    console.error('[watcher] could not start fs.watch:', err.message)
  }
}

function stop() {
  running = false
  if (watcher) { try { watcher.close() } catch {} watcher = null }
  for (const t of debounce.values()) clearTimeout(t)
  debounce.clear()
  queue.length = 0
  console.log('[watcher] stopped')
}

function status() {
  return {
    running,
    queueDepth:  queue.length,
    docsDir:     xdg.docsDir,
  }
}

module.exports = { start, stop, status }

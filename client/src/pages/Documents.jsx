import React, { useState, useEffect, useRef } from 'react'
import { api } from '../utils/api'
import { relativeTime, formatDateTime } from '../utils/time'

// ── Helpers ────────────────────────────────────────────────────────────────
function formatBytes(n) {
  if (!n) return '—'
  if (n < 1024)        return `${n} B`
  if (n < 1048576)     return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

function MimeTag({ mimeType }) {
  const label = mimeType
    ? mimeType.split('/').pop().split('+')[0].toUpperCase()
    : '?'
  const colours = {
    PDF:      'bg-red-900 text-red-300',
    MARKDOWN: 'bg-blue-900 text-blue-300',
    HTML:     'bg-orange-900 text-orange-300',
    JSON:     'bg-yellow-900 text-yellow-300',
    PLAIN:    'bg-gray-800 text-gray-400',
    XML:      'bg-purple-900 text-purple-300',
  }
  const cls = colours[label] || 'bg-gray-800 text-gray-400'
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono ${cls}`}>{label}</span>
  )
}

// ── Document row ───────────────────────────────────────────────────────────
function DocRow({ doc, onDelete, deleting }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Error indicator */}
        {doc.error
          ? <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title={doc.error} />
          : <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        }

        {/* Filename + metadata */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white text-sm font-semibold truncate">{doc.filename}</span>
            <MimeTag mimeType={doc.mimeType} />
            {doc.error && (
              <span className="px-2 py-0.5 bg-red-950 text-red-400 text-xs rounded">parse error</span>
            )}
          </div>
          <div className="flex gap-4 mt-1 text-xs text-gray-500">
            <span>{formatBytes(doc.sizeBytes)}</span>
            <span>{doc.chunkCount} chunk{doc.chunkCount !== 1 ? 's' : ''}</span>
            <span>Indexed {relativeTime(doc.indexedAt)}</span>
          </div>
        </button>

        {/* Delete */}
        <button
          onClick={onDelete}
          disabled={deleting}
          className="px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 text-xs rounded transition-colors disabled:opacity-50 shrink-0"
        >
          {deleting ? '…' : '✕'}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-800 px-4 py-3 space-y-2 text-xs">
          <div className="flex gap-6 text-gray-500">
            <span>Path: <span className="text-gray-300 font-mono break-all">{doc.filePath}</span></span>
          </div>
          <div className="flex gap-6 text-gray-500">
            <span>Last modified: <span className="text-gray-300">{formatDateTime(doc.mtime)}</span></span>
            <span>Indexed: <span className="text-gray-300">{formatDateTime(doc.indexedAt)}</span></span>
          </div>
          {doc.error && (
            <div className="text-red-400 bg-red-950 rounded p-2 font-mono">{doc.error}</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Documents({ token }) {
  const [docs, setDocs]         = useState([])
  const [status, setStatus]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const [ingestPath, setIngestPath]   = useState('')
  const [ingesting, setIngesting]     = useState(false)
  const [scanning, setScanning]       = useState(false)
  const [deletingId, setDeletingId]   = useState(null)
  const [confirmDelete, setConfirm]   = useState(null)

  const pathRef = useRef(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [docsData, statusData] = await Promise.all([
        api.get('/documents', token),
        api.get('/documents/status', token),
      ])
      setDocs(docsData)
      setStatus(statusData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleIngest(e) {
    e.preventDefault()
    const p = ingestPath.trim()
    if (!p) return
    setIngesting(true)
    setError('')
    setSuccess('')
    try {
      const result = await api.post('/documents/ingest', { path: p }, token)
      if (result.skipped) {
        setSuccess(`${result.filename} — already up to date (${result.chunkCount} chunks)`)
      } else {
        setSuccess(`Indexed ${result.filename} — ${result.chunkCount} chunks`)
      }
      setIngestPath('')
      loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setIngesting(false)
    }
  }

  async function handleScan() {
    setScanning(true)
    setError('')
    setSuccess('')
    try {
      const result = await api.post('/documents/scan', {}, token)
      setSuccess(`Queued ${result.queued} file${result.queued !== 1 ? 's' : ''} for indexing from docsDir`)
      setTimeout(loadAll, 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setScanning(false)
    }
  }

  async function handleDelete(id) {
    setDeletingId(id)
    try {
      const result = await api.delete(`/documents/${id}`, token)
      setSuccess(`Removed ${result.filename} and ${result.chunkCount} chunks from archive`)
      setConfirm(null)
      loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Loading documents…</div>

  const errorCount = docs.filter(d => d.error).length

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Documents</h2>
          <p className="text-gray-400 text-sm">
            Files indexed into semantic memory. Drop files into the documents directory
            and they are automatically parsed, chunked, and embedded.
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors disabled:opacity-50 shrink-0"
        >
          {scanning ? 'Scanning…' : '↺ Rescan'}
        </button>
      </div>

      {/* Feedback banners */}
      {error && (
        <div className="bg-red-950 border border-red-700 rounded px-4 py-2 text-red-300 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-300 ml-4">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-green-950 border border-green-700 rounded px-4 py-2 text-green-300 text-sm flex justify-between items-center">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="text-green-600 hover:text-green-400 ml-4">✕</button>
        </div>
      )}

      {/* Status bar */}
      {status && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 space-y-2">
          <div className="flex flex-wrap gap-6 text-sm">
            <span className="text-gray-400">
              Watcher:{' '}
              <span className={status.running ? 'text-green-400' : 'text-yellow-400'}>
                {status.running ? 'watching' : 'stopped'}
              </span>
            </span>
            <span className="text-gray-400">Queue: <span className="text-white">{status.queueDepth}</span></span>
            <span className="text-gray-400">Indexed: <span className="text-white">{status.docCount}</span></span>
            {errorCount > 0 && (
              <span className="text-red-400">{errorCount} parse error{errorCount !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Documents dir:</span>
            <code className="text-xs text-gray-300 font-mono">{status.docsDir}</code>
            <button
              onClick={() => navigator.clipboard.writeText(status.docsDir)}
              className="text-xs px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Manual ingest form */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-white font-semibold text-sm mb-3">Ingest file by path</h3>
        <form onSubmit={handleIngest} className="flex gap-2">
          <input
            ref={pathRef}
            value={ingestPath}
            onChange={e => setIngestPath(e.target.value)}
            placeholder="/absolute/path/to/file.pdf"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={ingesting || !ingestPath.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-semibold disabled:opacity-50 transition-colors shrink-0"
          >
            {ingesting ? 'Indexing…' : 'Ingest'}
          </button>
        </form>
        <p className="text-xs text-gray-600 mt-2">
          Supports .txt .md .pdf .html .json .py .js and most text-based formats. Max 5 MB.
        </p>
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="text-center text-gray-600 py-12">
          <div className="text-4xl mb-3">📄</div>
          <div className="text-gray-400">No documents indexed yet.</div>
          <div className="text-sm mt-1">
            Drop files into <code className="font-mono text-gray-500">{status?.docsDir}</code> or ingest by path above.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <DocRow
              key={doc.id}
              doc={doc}
              onDelete={() => setConfirm(doc.id)}
              deleting={deletingId === doc.id}
            />
          ))}
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold mb-2">Remove document?</h3>
            <p className="text-gray-400 text-sm mb-4">
              All chunks for this document will be removed from the semantic archive.
              The original file is not deleted.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirm(null)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded text-sm"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

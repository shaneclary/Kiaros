import React, { useState, useEffect } from 'react'
import { api } from '../utils/api'

const STATUS_COLORS = {
  success: 'text-green-400',
  failed: 'text-red-400',
  pending: 'text-yellow-400'
}

function getStatus(entry) {
  if (entry.error) return 'failed'
  if (entry.output) return 'success'
  return 'pending'
}

export default function Audit({ token }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { loadAudit() }, [page])

  async function loadAudit() {
    try {
      const data = await api.get(`/audit?page=${page}&limit=50`, token)
      setEntries(data.entries)
      setHasMore(data.entries.length === 50)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleUndo(entry) {
    if (!confirm(`Undo action: ${entry.tool_name}?`)) return
    try {
      await api.post(`/audit/${entry.id}/undo`, {}, token)
      setSuccess(`Undone: ${entry.tool_name}`)
      loadAudit()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Loading audit log...</div>

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Audit Log</h2>
        <p className="text-gray-400 text-sm">
          Every action performed by Kiaros is logged here. Append-only — entries cannot be deleted.
        </p>
      </div>

      {error && <div className="bg-red-950 border border-red-700 rounded px-4 py-2 text-red-300 text-sm">{error}</div>}
      {success && <div className="bg-green-950 border border-green-700 rounded px-4 py-2 text-green-300 text-sm">{success}</div>}

      {entries.length === 0 ? (
        <div className="text-center text-gray-600 py-8">
          <div className="text-3xl mb-2">📋</div>
          <div>No audit entries yet. Tool calls will appear here.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => {
            const status = getStatus(entry)
            return (
              <div key={entry.id} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpanded(e => e === entry.id ? null : entry.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800 transition-colors"
                >
                  <span className={`text-xs font-semibold uppercase ${STATUS_COLORS[status]}`}>{status}</span>
                  <span className="text-white text-sm font-medium">{entry.tool_name}</span>
                  <span className="text-gray-500 text-xs">{entry.approved_by}</span>
                  <span className="text-gray-600 text-xs ml-auto">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                  {entry.duration_ms && (
                    <span className="text-gray-600 text-xs">{entry.duration_ms}ms</span>
                  )}
                  {entry.reversible && !entry.reversed && (
                    <span className="text-blue-400 text-xs">reversible</span>
                  )}
                  {entry.reversed && (
                    <span className="text-gray-500 text-xs">reversed</span>
                  )}
                </button>

                {expanded === entry.id && (
                  <div className="border-t border-gray-800 px-4 py-3 space-y-2">
                    {entry.input && (
                      <div>
                        <div className="text-gray-500 text-xs mb-1">Input</div>
                        <pre className="text-gray-300 text-xs overflow-x-auto bg-gray-800 rounded p-2">
                          {JSON.stringify(entry.input, null, 2)}
                        </pre>
                      </div>
                    )}
                    {entry.output && (
                      <div>
                        <div className="text-gray-500 text-xs mb-1">Output</div>
                        <pre className="text-green-300 text-xs overflow-x-auto bg-gray-800 rounded p-2 max-h-48">
                          {JSON.stringify(entry.output, null, 2)}
                        </pre>
                      </div>
                    )}
                    {entry.error && (
                      <div>
                        <div className="text-gray-500 text-xs mb-1">Error</div>
                        <pre className="text-red-300 text-xs bg-gray-800 rounded p-2">{entry.error}</pre>
                      </div>
                    )}
                    {entry.reversible && !entry.reversed && (
                      <button
                        onClick={() => handleUndo(entry)}
                        className="px-3 py-1 bg-yellow-900 hover:bg-yellow-800 text-yellow-300 text-xs rounded transition-colors"
                      >
                        ↩ Undo this action
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-2 justify-center pb-4">
        {page > 1 && (
          <button onClick={() => setPage(p => p - 1)} className="px-3 py-1 bg-gray-800 text-gray-300 text-sm rounded hover:bg-gray-700">
            ← Prev
          </button>
        )}
        <span className="px-3 py-1 text-gray-500 text-sm">Page {page}</span>
        {hasMore && (
          <button onClick={() => setPage(p => p + 1)} className="px-3 py-1 bg-gray-800 text-gray-300 text-sm rounded hover:bg-gray-700">
            Next →
          </button>
        )}
      </div>
    </div>
  )
}

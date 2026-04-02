import { useState, useEffect } from 'react'
import api from '../utils/api'

export default function Audit() {
  const [entries, setEntries] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const limit = 30

  useEffect(() => {
    loadEntries()
  }, [offset])

  async function loadEntries() {
    setLoading(true)
    try {
      const data = await api.getAuditLog(limit, offset)
      setEntries(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleUndo(id) {
    if (!confirm('Undo this action?')) return
    try {
      await api.undoAction(id)
      loadEntries()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-xl font-bold mb-1">Audit Log</h2>
      <p className="text-sm text-gray-500 mb-6">Every action is logged. Nothing is hidden.</p>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-gray-600">No actions recorded yet.</p>
      ) : (
        <>
          <div className="space-y-2">
            {entries.map(entry => (
              <div
                key={entry.id}
                className="card py-3 cursor-pointer hover:border-gray-700 transition-colors"
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-kiaros-400">{entry.tool_name || entry.tool_id}</span>
                    <span className="text-xs text-gray-500">{entry.approved_by}</span>
                    {entry.duration_ms && (
                      <span className="text-xs text-gray-600">{entry.duration_ms}ms</span>
                    )}
                    {entry.token_cost && (
                      <span className="text-xs text-gray-600">${(entry.token_cost / 100000).toFixed(4)}</span>
                    )}
                    {entry.error && (
                      <span className="badge-high text-xs">error</span>
                    )}
                    {entry.reversed ? (
                      <span className="badge bg-purple-900/50 text-purple-400 border border-purple-800 text-xs">undone</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-600">{entry.created_at}</span>
                    {entry.reversible && !entry.reversed && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUndo(entry.id) }}
                        className="text-xs text-yellow-400 hover:text-yellow-300"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable details */}
                {expanded === entry.id && (
                  <div className="mt-3 space-y-2 border-t border-gray-800 pt-3">
                    {entry.input && (
                      <div>
                        <span className="text-xs font-medium text-gray-400">Input:</span>
                        <pre className="text-xs text-gray-500 mt-1 bg-gray-800/50 p-2 rounded overflow-auto max-h-40">
                          {(() => { try { return JSON.stringify(JSON.parse(entry.input), null, 2) } catch { return entry.input } })()}
                        </pre>
                      </div>
                    )}
                    {entry.output && (
                      <div>
                        <span className="text-xs font-medium text-green-400">Output:</span>
                        <pre className="text-xs text-gray-500 mt-1 bg-gray-800/50 p-2 rounded overflow-auto max-h-40">
                          {(() => { try { return JSON.stringify(JSON.parse(entry.output), null, 2) } catch { return entry.output } })()}
                        </pre>
                      </div>
                    )}
                    {entry.error && (
                      <div>
                        <span className="text-xs font-medium text-red-400">Error:</span>
                        <pre className="text-xs text-red-400/70 mt-1 bg-red-900/10 p-2 rounded">{entry.error}</pre>
                      </div>
                    )}
                    <div className="text-xs text-gray-600">
                      ID: {entry.id}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-between mt-4">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="btn-ghost text-sm"
              disabled={offset === 0}
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + limit)}
              className="btn-ghost text-sm"
              disabled={entries.length < limit}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}

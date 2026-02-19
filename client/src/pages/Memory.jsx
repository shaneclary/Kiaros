import React, { useState, useEffect } from 'react'
import { api } from '../utils/api'

export default function Memory({ token }) {
  const [memories, setMemories] = useState([])
  const [loading, setLoading] = useState(true)
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingKey, setEditingKey] = useState(null)
  const [editValue, setEditValue] = useState('')

  useEffect(() => { loadMemories() }, [])

  async function loadMemories() {
    try {
      const data = await api.get('/memory/working', token)
      setMemories(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError('')
    if (!key.trim()) return setError('Key is required')
    if (!value.trim()) return setError('Value is required')
    try {
      await api.put(`/memory/working/${encodeURIComponent(key.trim())}`, { value: value.trim() }, token)
      setSuccess(`Memory "${key}" saved`)
      setKey('')
      setValue('')
      loadMemories()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleEdit(memKey) {
    try {
      await api.put(`/memory/working/${encodeURIComponent(memKey)}`, { value: editValue }, token)
      setSuccess(`Memory "${memKey}" updated`)
      setEditingKey(null)
      loadMemories()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(memKey) {
    if (!confirm(`Delete memory "${memKey}"?`)) return
    try {
      await api.delete(`/memory/working/${encodeURIComponent(memKey)}`, token)
      setSuccess(`Memory "${memKey}" deleted`)
      loadMemories()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Loading memory...</div>

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Working Memory</h2>
        <p className="text-gray-400 text-sm">
          Key-value facts you want Kiaros to remember across conversations. Included in every chat context.
        </p>
      </div>

      {error && <div className="bg-red-950 border border-red-700 rounded px-4 py-2 text-red-300 text-sm">{error}</div>}
      {success && <div className="bg-green-950 border border-green-700 rounded px-4 py-2 text-green-300 text-sm">{success}</div>}

      {/* Add memory */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-3">Add Memory</h3>
        <form onSubmit={handleAdd} className="space-y-2">
          <div className="flex gap-2">
            <input
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="Key (e.g. favorite_color)"
              className="w-48 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Value (e.g. blue)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-semibold transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>

      {/* Memory list */}
      {memories.length === 0 ? (
        <div className="text-center text-gray-600 py-8">
          <div className="text-3xl mb-2">🧠</div>
          <div>No memories yet. Add context above.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map(mem => (
            <div key={mem.key} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-blue-400 font-mono text-sm font-semibold">{mem.key}</span>
                    <span className="text-xs text-gray-600">{mem.source}</span>
                  </div>
                  {editingKey === mem.key ? (
                    <div className="flex gap-2">
                      <input
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
                        autoFocus
                      />
                      <button onClick={() => handleEdit(mem.key)} className="px-2 py-1 bg-green-700 text-white text-xs rounded">Save</button>
                      <button onClick={() => setEditingKey(null)} className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded">Cancel</button>
                    </div>
                  ) : (
                    <div className="text-gray-200 text-sm">{mem.value}</div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => { setEditingKey(mem.key); setEditValue(mem.value) }}
                    className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                  >Edit</button>
                  <button
                    onClick={() => handleDelete(mem.key)}
                    className="text-xs px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded transition-colors"
                  >Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

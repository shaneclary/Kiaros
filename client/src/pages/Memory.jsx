import { useState, useEffect } from 'react'
import api from '../utils/api'

export default function Memory() {
  const [memories, setMemories] = useState([])
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMemories()
  }, [])

  async function loadMemories() {
    try {
      const data = await api.getWorkingMemory()
      setMemories(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!newKey || !newValue) return
    try {
      await api.setMemory(newKey, newValue)
      setNewKey('')
      setNewValue('')
      loadMemories()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDelete(key) {
    try {
      await api.deleteMemory(key)
      loadMemories()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-xl font-bold mb-1">Working Memory</h2>
      <p className="text-sm text-gray-500 mb-6">
        Key-value pairs injected into every conversation. Claude sees this context.
      </p>

      <form onSubmit={handleAdd} className="card mb-6">
        <div className="flex gap-3">
          <input
            className="input w-48"
            placeholder="Key (e.g. name)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <input
            className="input flex-1"
            placeholder="Value (e.g. Shane)"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={!newKey || !newValue}>
            Add
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : memories.length === 0 ? (
        <p className="text-gray-600">No memories stored yet.</p>
      ) : (
        <div className="space-y-2">
          {memories.map(m => (
            <div key={m.key} className="card flex items-center justify-between">
              <div>
                <span className="font-mono text-kiaros-400 text-sm">{m.key}</span>
                <span className="text-gray-500 mx-2">=</span>
                <span className="text-gray-300 text-sm">{m.value}</span>
                <span className="text-xs text-gray-600 ml-3">{m.source}</span>
              </div>
              <button onClick={() => handleDelete(m.key)} className="text-xs text-red-400 hover:text-red-300">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

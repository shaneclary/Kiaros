import React, { useState, useEffect } from 'react'
import { api } from '../utils/api'

const INTERRUPT_MODES = [
  { value: 'confirm', label: 'Confirm (Default)', description: 'Ask before every tool action' },
  { value: 'smart', label: 'Smart', description: 'Ask only for high-risk or irreversible actions' },
  { value: 'auto', label: 'Auto (Trust Mode)', description: 'Never ask — execute all approved tools automatically' },
]

const MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-20250514',
  'claude-haiku-4-20250514',
]

export default function Settings({ token }) {
  const [credentials, setCredentials] = useState([])
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  // New credential form
  const [newLabel, setNewLabel] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newModel, setNewModel] = useState('claude-sonnet-4-20250514')
  const [newBudget, setNewBudget] = useState('')
  const [adding, setAdding] = useState(false)
  const [testing, setTesting] = useState(null)

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    try {
      const [creds, cfg] = await Promise.all([
        api.get('/credentials', token),
        api.get('/settings', token)
      ])
      setCredentials(creds)
      setSettings(cfg)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function addCredential(e) {
    e.preventDefault()
    setError('')
    if (!newLabel.trim()) return setError('Label is required')
    if (!newKey.trim()) return setError('API key is required')

    setAdding(true)
    try {
      await api.post('/credentials', {
        label: newLabel.trim(),
        apiKey: newKey.trim(),
        model: newModel,
        monthlyBudgetCents: newBudget ? parseInt(newBudget) * 100 : 0
      }, token)
      setSuccess('API key added')
      setNewLabel('')
      setNewKey('')
      setNewBudget('')
      loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function testCredential(id) {
    setTesting(id)
    setError('')
    try {
      const result = await api.post(`/credentials/${id}/test`, {}, token)
      if (result.valid) {
        setSuccess(`Connection valid! Model: ${result.model}`)
      } else {
        setError(`Connection failed: ${result.error}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setTesting(null)
    }
  }

  async function deleteCredential(id) {
    if (!confirm('Delete this API key?')) return
    try {
      await api.delete(`/credentials/${id}`, token)
      setSuccess('API key removed')
      loadAll()
    } catch (err) {
      setError(err.message)
    }
  }

  async function updateSetting(key, value) {
    try {
      const updated = await api.put('/settings', { [key]: value }, token)
      setSettings(updated)
      setSuccess('Setting saved')
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Loading settings...</div>

  return (
    <div className="h-full overflow-y-auto p-6 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Settings</h2>
        <p className="text-gray-400 text-sm">Manage API keys, model configuration, and behavior settings.</p>
      </div>

      {error && <div className="bg-red-950 border border-red-700 rounded px-4 py-2 text-red-300 text-sm">{error}</div>}
      {success && <div className="bg-green-950 border border-green-700 rounded px-4 py-2 text-green-300 text-sm">{success}</div>}

      {/* API Keys */}
      <section>
        <h3 className="text-white font-semibold mb-3">API Keys</h3>
        <div className="space-y-2 mb-4">
          {credentials.length === 0 ? (
            <div className="text-gray-500 text-sm py-2">No API keys configured.</div>
          ) : credentials.map(cred => (
            <div key={cred.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="text-white text-sm font-medium">{cred.label}</div>
                <div className="text-gray-500 text-xs font-mono">{cred.keyMasked}</div>
                <div className="text-gray-600 text-xs">Model: {cred.model}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => testCredential(cred.id)}
                  disabled={testing === cred.id}
                  className="text-xs px-2 py-1 bg-blue-900 hover:bg-blue-800 text-blue-300 rounded disabled:opacity-50 transition-colors"
                >
                  {testing === cred.id ? 'Testing...' : 'Test'}
                </button>
                <button
                  onClick={() => deleteCredential(cred.id)}
                  className="text-xs px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h4 className="text-gray-300 text-sm font-semibold mb-3">Add API Key</h4>
          <form onSubmit={addCredential} className="space-y-2">
            <div className="flex gap-2">
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Label (e.g. My Anthropic Key)"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <select
                value={newModel}
                onChange={e => setNewModel(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {MODELS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <input
              type="password"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              placeholder="sk-ant-api... (stored encrypted, never logged)"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2">
              <input
                value={newBudget}
                onChange={e => setNewBudget(e.target.value)}
                placeholder="Monthly budget in USD (optional)"
                type="number"
                min="0"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={adding}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded text-sm font-semibold transition-colors"
              >
                {adding ? 'Adding...' : 'Add Key'}
              </button>
            </div>
          </form>
          <p className="text-gray-600 text-xs mt-2">
            Keys are encrypted with AES-256-GCM and never logged or sent externally.
          </p>
        </div>
      </section>

      {/* Interrupt Mode */}
      <section>
        <h3 className="text-white font-semibold mb-3">Interrupt Mode</h3>
        <p className="text-gray-400 text-sm mb-3">
          Controls when Kiaros asks for your approval before executing tool actions.
        </p>
        <div className="space-y-2">
          {INTERRUPT_MODES.map(mode => (
            <label
              key={mode.value}
              className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                settings.interruptMode === mode.value
                  ? 'border-blue-500 bg-blue-950'
                  : 'border-gray-700 bg-gray-900 hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="interruptMode"
                value={mode.value}
                checked={settings.interruptMode === mode.value}
                onChange={() => updateSetting('interruptMode', mode.value)}
                className="mt-1"
              />
              <div>
                <div className="text-white text-sm font-medium">{mode.label}</div>
                <div className="text-gray-400 text-xs">{mode.description}</div>
              </div>
            </label>
          ))}
        </div>
        {settings.interruptMode === 'auto' && (
          <div className="mt-2 bg-yellow-950 border border-yellow-700 rounded px-3 py-2 text-yellow-300 text-sm">
            ⚠️ Auto mode executes all approved tools without confirmation. Use with caution.
          </div>
        )}
      </section>

      {/* Model Provider */}
      <section>
        <h3 className="text-white font-semibold mb-3">Model Provider</h3>
        <div className="space-y-2">
          {[
            { value: 'anthropic', label: 'Anthropic Claude', description: 'Use your Anthropic API key' },
            { value: 'ollama', label: 'Ollama (Local)', description: 'Use a locally-running Ollama model (no API key required)' }
          ].map(prov => (
            <label
              key={prov.value}
              className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                (settings.provider || 'anthropic') === prov.value
                  ? 'border-blue-500 bg-blue-950'
                  : 'border-gray-700 bg-gray-900 hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={prov.value}
                checked={(settings.provider || 'anthropic') === prov.value}
                onChange={() => updateSetting('provider', prov.value)}
                className="mt-1"
              />
              <div>
                <div className="text-white text-sm font-medium">{prov.label}</div>
                <div className="text-gray-400 text-xs">{prov.description}</div>
              </div>
            </label>
          ))}
        </div>

        {(settings.provider === 'ollama') && (
          <div className="mt-2 flex gap-2">
            <input
              value={settings.ollamaModel || 'llama3.2'}
              onChange={e => updateSetting('ollamaModel', e.target.value)}
              placeholder="Ollama model name (e.g. llama3.2)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        )}
      </section>
    </div>
  )
}

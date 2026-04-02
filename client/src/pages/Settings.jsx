import { useState, useEffect } from 'react'
import api from '../utils/api'

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [credentials, setCredentials] = useState([])
  const [interrupts, setInterrupts] = useState([])
  const [newCred, setNewCred] = useState({ label: '', apiKey: '', model: 'claude-sonnet-4-20250514' })
  const [loading, setLoading] = useState(true)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    loadData()
    // Poll for interrupts every 3 seconds
    const interval = setInterval(loadInterrupts, 3000)
    return () => clearInterval(interval)
  }, [])

  async function loadInterrupts() {
    try {
      const data = await api.getInterrupts()
      setInterrupts(data)
    } catch { /* ignore */ }
  }

  async function loadData() {
    try {
      const [s, c, i] = await Promise.all([api.getSettings(), api.listCredentials(), api.getInterrupts()])
      setSettings(s)
      setCredentials(c)
      setInterrupts(i)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddCredential(e) {
    e.preventDefault()
    try {
      const passphrase = api.getPassphrase()
      await api.addCredential(newCred.label, newCred.apiKey, passphrase, newCred.model)
      setNewCred({ label: '', apiKey: '', model: 'claude-sonnet-4-20250514' })
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDeleteCredential(id) {
    if (!confirm('Delete this credential?')) return
    try {
      await api.deleteCredential(id)
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleTestCredential(id) {
    setTestResult(null)
    try {
      const result = await api.testCredential(id)
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, error: err.message })
    }
  }

  async function handleUpdateSetting(key, value) {
    try {
      await api.updateSettings({ [key]: value })
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>

  return (
    <div className="p-6 max-w-4xl space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-1">Settings</h2>
        <p className="text-sm text-gray-500">Manage credentials, modes, and configuration.</p>
      </div>

      {/* Credentials */}
      <section>
        <h3 className="font-semibold mb-3">API Credentials</h3>

        <form onSubmit={handleAddCredential} className="card mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              className="input"
              placeholder="Label (e.g. Primary)"
              value={newCred.label}
              onChange={(e) => setNewCred({ ...newCred, label: e.target.value })}
            />
            <select
              className="input"
              value={newCred.model}
              onChange={(e) => setNewCred({ ...newCred, model: e.target.value })}
            >
              <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
              <option value="claude-opus-4-20250514">Claude Opus 4</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
            </select>
          </div>
          <input
            className="input font-mono"
            placeholder="sk-ant-api..."
            type="password"
            value={newCred.apiKey}
            onChange={(e) => setNewCred({ ...newCred, apiKey: e.target.value })}
          />
          <button type="submit" className="btn-primary text-sm" disabled={!newCred.label || !newCred.apiKey}>
            Add Credential
          </button>
        </form>

        <div className="space-y-2">
          {credentials.map(c => (
            <div key={c.id} className="card flex items-center justify-between">
              <div>
                <span className="font-medium">{c.label}</span>
                <span className="text-xs text-gray-500 ml-3">{c.model}</span>
                {c.is_active ? <span className="badge-low ml-2 text-xs">active</span> : null}
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleTestCredential(c.id)} className="btn-ghost text-xs">
                  Test
                </button>
                <button onClick={() => handleDeleteCredential(c.id)} className="text-xs text-red-400 hover:text-red-300">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {testResult && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
            {testResult.success ? `Connected! Model: ${testResult.model}` : `Failed: ${testResult.error}`}
          </div>
        )}
      </section>

      {/* Interrupt Mode */}
      <section>
        <h3 className="font-semibold mb-3">Interrupt Mode</h3>
        <p className="text-sm text-gray-500 mb-3">Controls when the system asks for approval before tool execution.</p>
        <div className="flex gap-3">
          {['confirm', 'smart', 'auto'].map(mode => (
            <button
              key={mode}
              onClick={() => handleUpdateSetting('interruptMode', mode)}
              className={`card cursor-pointer flex-1 text-center transition-colors ${
                settings?.interruptMode === mode
                  ? 'border-kiaros-500 bg-kiaros-600/10'
                  : 'hover:border-gray-700'
              }`}
            >
              <div className="font-medium capitalize">{mode}</div>
              <div className="text-xs text-gray-500 mt-1">
                {mode === 'confirm' && 'Approve every action'}
                {mode === 'smart' && 'Approve high-risk only'}
                {mode === 'auto' && 'Trust mode (no prompts)'}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Pending Interrupts */}
      {interrupts.length > 0 && (
        <section>
          <h3 className="font-semibold mb-3 text-yellow-400">Pending Interrupts ({interrupts.length})</h3>
          <p className="text-sm text-gray-500 mb-3">Actions awaiting your approval.</p>
          <div className="space-y-2">
            {interrupts.map(interrupt => (
              <div key={interrupt.id} className="card border-yellow-800 bg-yellow-900/10">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-medium text-sm">{interrupt.action?.toolName || 'Unknown Tool'}</span>
                    <span className={`ml-2 text-xs ${
                      interrupt.action?.riskLevel === 'high' ? 'text-red-400' :
                      interrupt.action?.riskLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                      {interrupt.action?.riskLevel} risk
                    </span>
                    {interrupt.action?.input && (
                      <pre className="text-xs text-gray-500 mt-1 max-h-16 overflow-hidden">
                        {JSON.stringify(interrupt.action.input, null, 2).substring(0, 200)}
                      </pre>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={async () => { await api.resolveInterrupt(interrupt.id, true); loadInterrupts() }}
                      className="btn-primary text-xs px-3 py-1"
                    >
                      Allow
                    </button>
                    <button
                      onClick={async () => { await api.resolveInterrupt(interrupt.id, false); loadInterrupts() }}
                      className="btn-danger text-xs px-3 py-1"
                    >
                      Block
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tick Engine Config */}
      <section>
        <h3 className="font-semibold mb-3">Tick Engine Configuration</h3>
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Interval (seconds)</span>
            <input
              type="number"
              className="input w-24 text-sm"
              value={(settings?.tick?.intervalMs || 60000) / 1000}
              onChange={(e) => handleUpdateSetting('tick', {
                ...settings?.tick,
                intervalMs: parseInt(e.target.value) * 1000
              })}
              min={10}
              max={3600}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Idle Threshold (seconds)</span>
            <input
              type="number"
              className="input w-24 text-sm"
              value={(settings?.tick?.idleThresholdMs || 300000) / 1000}
              onChange={(e) => handleUpdateSetting('tick', {
                ...settings?.tick,
                idleThresholdMs: parseInt(e.target.value) * 1000
              })}
              min={30}
              max={7200}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Max Autonomous Risk Level</span>
            <select
              className="input w-32 text-sm"
              value={settings?.tick?.maxAutonomousRisk || 'low'}
              onChange={(e) => handleUpdateSetting('tick', {
                ...settings?.tick,
                maxAutonomousRisk: e.target.value
              })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  )
}

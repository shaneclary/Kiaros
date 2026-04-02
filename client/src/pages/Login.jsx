import { useState } from 'react'
import api from '../utils/api'

export default function Login({ onLogin }) {
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { token } = await api.login(passphrase)
      onLogin(token, passphrase)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card max-w-md w-full">
        <h1 className="text-2xl font-bold text-kiaros-400 mb-2">KIAROS</h1>
        <p className="text-gray-400 text-sm mb-6">AI Orchestration Engine</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Passphrase</label>
            <input
              type="password"
              className="input"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter your passphrase"
              autoFocus
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={loading || !passphrase}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}

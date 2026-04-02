import { useState } from 'react'
import api from '../utils/api'

export default function Setup({ onComplete }) {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (passphrase !== confirm) {
      setError('Passphrases do not match')
      return
    }
    if (passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { token } = await api.setup(passphrase)
      onComplete(token, passphrase)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card max-w-md w-full">
        <h1 className="text-2xl font-bold text-kiaros-400 mb-2">Welcome to KIAROS</h1>
        <p className="text-gray-400 text-sm mb-6">
          Set up your passphrase. This encrypts your API keys and protects your instance.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Passphrase</label>
            <input
              type="password"
              className="input"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="At least 8 characters"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Confirm Passphrase</label>
            <input
              type="password"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm your passphrase"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={loading || !passphrase || !confirm}>
            {loading ? 'Setting up...' : 'Create Passphrase'}
          </button>
        </form>
      </div>
    </div>
  )
}

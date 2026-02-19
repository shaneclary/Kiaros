import React, { useState } from 'react'
import { api } from '../utils/api'

export default function Login({ onLogin }) {
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token } = await api.post('/auth/login', { passphrase })
      onLogin(token)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setPassphrase('')
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚡</div>
          <h1 className="text-2xl font-bold text-white">Kiaros 2.0</h1>
          <p className="text-gray-500 text-sm mt-1">Enter your passphrase to continue</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Passphrase</label>
              <input
                type="password"
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                placeholder="Your passphrase"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-950 border border-red-700 rounded px-3 py-2 text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !passphrase}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded py-2 font-semibold text-sm transition-colors"
            >
              {loading ? 'Verifying...' : 'Unlock'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-600 mt-4">
            Sessions expire after 24 hours or server restart
          </p>
        </div>
      </div>
    </div>
  )
}

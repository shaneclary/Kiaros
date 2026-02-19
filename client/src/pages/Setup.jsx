import React, { useState } from 'react'
import { api } from '../utils/api'

export default function Setup({ onComplete }) {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (passphrase.length < 8) {
      return setError('Passphrase must be at least 8 characters')
    }
    if (passphrase !== confirm) {
      return setError('Passphrases do not match')
    }

    setLoading(true)
    try {
      await api.post('/auth/setup', { passphrase })
      onComplete()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚡</div>
          <h1 className="text-2xl font-bold text-white">Welcome to Kiaros 2.0</h1>
          <p className="text-gray-400 mt-2 text-sm">
            Self-hosted AI executive engine. Security-first by design.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-1">First-Run Setup</h2>
          <p className="text-gray-400 text-sm mb-4">
            Set a passphrase to secure your Kiaros installation. This protects your API keys and session data.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Passphrase</label>
              <input
                type="password"
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Confirm Passphrase</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat passphrase"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            {error && (
              <div className="bg-red-950 border border-red-700 rounded px-3 py-2 text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded py-2 font-semibold text-sm transition-colors"
            >
              {loading ? 'Setting up...' : 'Set Passphrase & Continue'}
            </button>
          </form>

          <div className="mt-4 p-3 bg-gray-800 rounded text-xs text-gray-400 space-y-1">
            <div className="font-semibold text-gray-300">Security Notes:</div>
            <div>• Passphrase is hashed with bcrypt (cost 12) — never stored in plaintext</div>
            <div>• API keys are encrypted with AES-256-GCM using a server secret</div>
            <div>• All data stays on your machine</div>
          </div>
        </div>
      </div>
    </div>
  )
}

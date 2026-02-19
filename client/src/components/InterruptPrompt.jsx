import React from 'react'
import { api } from '../utils/api'

const RISK_COLORS = {
  low: 'text-green-400 bg-green-950 border-green-700',
  medium: 'text-yellow-400 bg-yellow-950 border-yellow-700',
  high: 'text-red-400 bg-red-950 border-red-700',
  unknown: 'text-gray-400 bg-gray-800 border-gray-600'
}

export default function InterruptPrompt({ interrupt, token, onResolved }) {
  const { id, action } = interrupt

  async function resolve(approved) {
    try {
      await api.post(`/tools/interrupts/${id}/resolve`, { approved }, token)
      onResolved(id)
    } catch (err) {
      console.error('Failed to resolve interrupt:', err)
    }
  }

  const riskClass = RISK_COLORS[action.riskLevel] || RISK_COLORS.unknown

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-md w-full p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-2">Action Approval Required</h2>
        <p className="text-gray-400 text-sm mb-4">
          Kiaros wants to use a tool. Please review and approve or block this action.
        </p>

        <div className="bg-gray-800 rounded p-3 mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Tool</span>
            <span className="text-white font-semibold text-sm">{action.toolName || action.toolId}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Risk Level</span>
            <span className={`text-xs px-2 py-0.5 rounded border font-semibold uppercase ${riskClass}`}>
              {action.riskLevel || 'unknown'}
            </span>
          </div>
        </div>

        {action.input && Object.keys(action.input).length > 0 && (
          <div className="mb-4">
            <div className="text-gray-400 text-sm mb-1">Input Parameters:</div>
            <pre className="bg-gray-800 rounded p-2 text-xs text-gray-300 overflow-x-auto max-h-32">
              {JSON.stringify(action.input, null, 2)}
            </pre>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => resolve(false)}
            className="flex-1 px-4 py-2 bg-red-800 hover:bg-red-700 text-white rounded font-semibold transition-colors"
          >
            🚫 Block
          </button>
          <button
            onClick={() => resolve(true)}
            className="flex-1 px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded font-semibold transition-colors"
          >
            ✅ Allow
          </button>
        </div>
      </div>
    </div>
  )
}

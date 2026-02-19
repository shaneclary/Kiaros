import React from 'react'

const RISK_BADGES = {
  low:    'bg-green-900 text-green-300 border border-green-700',
  medium: 'bg-yellow-900 text-yellow-300 border border-yellow-700',
  high:   'bg-red-900 text-red-300 border border-red-700',
}

const RISK_ICONS = {
  low: '🟢',
  medium: '🟡',
  high: '🔴'
}

export default function ScopeApprovalCard({ scope, scopeDef, selected, onToggle }) {
  const badgeClass = RISK_BADGES[scopeDef?.risk] || 'bg-gray-700 text-gray-300'
  const icon = RISK_ICONS[scopeDef?.risk] || '⚪'

  return (
    <div
      onClick={() => onToggle(scope)}
      className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-950'
          : 'border-gray-700 bg-gray-800 hover:border-gray-500'
      }`}
    >
      <div className="mt-0.5">
        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
          selected ? 'bg-blue-500 border-blue-500' : 'border-gray-500'
        }`}>
          {selected && <span className="text-white text-xs">✓</span>}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-white text-sm font-medium">{scopeDef?.label || scope}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${badgeClass}`}>
            {icon} {scopeDef?.risk || 'unknown'}
          </span>
        </div>
        <div className="text-gray-400 text-xs">{scopeDef?.description}</div>
        <div className="text-gray-600 text-xs mt-0.5 font-mono">{scope}</div>
      </div>
    </div>
  )
}

import React, { useState } from 'react'

export default function ToolCall({ call, result }) {
  const [expanded, setExpanded] = useState(false)
  const isError = result?.isError

  return (
    <div className={`mb-2 border rounded text-xs font-mono ${
      isError ? 'border-red-700 bg-red-950' : 'border-green-800 bg-green-950'
    }`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span>{isError ? '❌' : '✅'}</span>
        <span className="text-gray-300 font-semibold">{call.name}</span>
        <span className="text-gray-500 ml-auto">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 border-t border-gray-800 pt-2 space-y-2">
          <div>
            <div className="text-gray-500 mb-1">Input:</div>
            <pre className="text-gray-300 overflow-x-auto">
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>
          {result && (
            <div>
              <div className="text-gray-500 mb-1">Result:</div>
              <pre className={`overflow-x-auto ${isError ? 'text-red-300' : 'text-green-300'}`}>
                {JSON.stringify(result.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

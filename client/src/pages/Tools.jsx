import { useState, useEffect } from 'react'
import api from '../utils/api'

function RiskBadge({ level }) {
  const cls = {
    low: 'badge-low',
    medium: 'badge-medium',
    high: 'badge-high',
    unknown: 'badge bg-gray-700 text-gray-400'
  }
  return <span className={cls[level] || cls.unknown}>{level}</span>
}

export default function Tools() {
  const [tools, setTools] = useState([])
  const [scopes, setScopes] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [t, s] = await Promise.all([api.listTools(), api.getScopes()])
      setTools(t)
      setScopes(s)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(tool) {
    try {
      await api.approveScopes(tool.id, tool.required_scopes)
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleRevoke(toolId) {
    try {
      await api.revokeScopes(toolId)
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="p-6 text-gray-500">Loading tools...</div>

  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-xl font-bold mb-1">Tool Registry</h2>
      <p className="text-sm text-gray-500 mb-6">Approve tool scopes before they can be used in chat.</p>

      <div className="space-y-4">
        {tools.map(tool => (
          <div key={tool.id} className="card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold">{tool.name}</h3>
                <p className="text-sm text-gray-400">{tool.description}</p>
              </div>
              <RiskBadge level={tool.risk_level} />
            </div>

            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-1">Required Scopes:</p>
              <div className="flex flex-wrap gap-2">
                {tool.required_scopes.map(scope => (
                  <span key={scope} className="text-xs bg-gray-800 px-2 py-1 rounded">
                    {scope}
                    {scopes[scope] && (
                      <span className="text-gray-500 ml-1">— {scopes[scope].description}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              {tool.approved ? (
                <>
                  <span className="badge-low">Approved</span>
                  <button onClick={() => handleRevoke(tool.id)} className="text-xs text-red-400 hover:text-red-300">
                    Revoke
                  </button>
                </>
              ) : (
                <button onClick={() => handleApprove(tool)} className="btn-primary text-sm">
                  Approve Scopes
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

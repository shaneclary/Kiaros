import React, { useState, useEffect } from 'react'
import { api } from '../utils/api'
import ScopeApprovalCard from '../components/ScopeApprovalCard'

const RISK_COLORS = {
  low:     'text-green-400',
  medium:  'text-yellow-400',
  high:    'text-red-400',
  unknown: 'text-gray-400',
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-500 text-white'
          : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
      }`}
    >
      {children}
    </button>
  )
}

export default function Tools({ token }) {
  const [activeTab, setActiveTab] = useState('registry')

  // ── Registry state ───────────────────────────────────────────────────────
  const [tools, setTools]               = useState([])
  const [scopes, setScopes]             = useState({})
  const [selectedTool, setSelectedTool] = useState(null)
  const [selectedScopes, setSelectedScopes] = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [success, setSuccess]           = useState('')
  const [installCmd, setInstallCmd]     = useState('')
  const [installName, setInstallName]   = useState('')
  const [installing, setInstalling]     = useState(false)

  // ── Generate tab state ───────────────────────────────────────────────────
  const [genDesc, setGenDesc]       = useState('')
  const [generating, setGenerating] = useState(false)
  const [proposal, setProposal]     = useState(null)
  const [genError, setGenError]     = useState('')
  const [genSuccess, setGenSuccess] = useState('')
  const [installGen, setInstallGen] = useState(false)

  useEffect(() => { loadTools() }, [])

  async function loadTools() {
    try {
      const data = await api.get('/tools', token)
      setTools(data.tools)
      setScopes(data.scopes)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Registry handlers ────────────────────────────────────────────────────
  function openApproval(tool) {
    setSelectedTool(tool)
    setSelectedScopes(tool.approvedScopes || [])
    setError('')
    setSuccess('')
  }

  function toggleScope(scope) {
    setSelectedScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    )
  }

  async function approveScopes() {
    if (!selectedTool) return
    const missing = selectedTool.requiredScopes.filter(s => !selectedScopes.includes(s))
    if (missing.length > 0) return setError(`Must approve all required scopes: ${missing.join(', ')}`)
    try {
      await api.post(`/tools/${selectedTool.id}/approve`, { scopes: selectedScopes }, token)
      setSuccess(`${selectedTool.name} scopes approved`)
      setSelectedTool(null)
      loadTools()
    } catch (err) {
      setError(err.message)
    }
  }

  async function revokeApproval(toolId) {
    try {
      await api.delete(`/tools/${toolId}/approve`, token)
      setSuccess('Approval revoked')
      loadTools()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleEnabled(tool) {
    try {
      await api.put(`/tools/${tool.id}`, { enabled: !tool.enabled }, token)
      loadTools()
    } catch (err) {
      setError(err.message)
    }
  }

  async function installMcp(e) {
    e.preventDefault()
    if (!installCmd.trim()) return
    setInstalling(true)
    setError('')
    try {
      await api.post('/tools/install', {
        command:        installCmd.trim(),
        name:           installName.trim() || undefined,
        requiredScopes: ['shell:exec'],
      }, token)
      setSuccess('MCP tool installed')
      setInstallCmd('')
      setInstallName('')
      loadTools()
    } catch (err) {
      setError(err.message)
    } finally {
      setInstalling(false)
    }
  }

  // ── Generate tab handlers ────────────────────────────────────────────────
  async function handleGenerate(e) {
    e.preventDefault()
    if (!genDesc.trim()) return
    setGenerating(true)
    setGenError('')
    setGenSuccess('')
    setProposal(null)
    try {
      const result = await api.post('/tools/generate', { description: genDesc.trim() }, token)
      setProposal(result)
    } catch (err) {
      setGenError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleInstallGenerated() {
    if (!proposal) return
    setInstallGen(true)
    setGenError('')
    try {
      await api.post('/tools/install-generated', { proposal }, token)
      setGenSuccess(`Tool "${proposal.name}" installed and added to the registry`)
      setProposal(null)
      setGenDesc('')
      loadTools()
      setActiveTab('registry')
    } catch (err) {
      setGenError(err.message)
    } finally {
      setInstallGen(false)
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Loading tools…</div>

  return (
    <div className="h-full overflow-y-auto">
      {/* Tab bar */}
      <div className="flex border-b border-gray-800 px-6 bg-gray-950 sticky top-0 z-10">
        <TabBtn active={activeTab === 'registry'} onClick={() => setActiveTab('registry')}>
          Registry
        </TabBtn>
        <TabBtn active={activeTab === 'generate'} onClick={() => setActiveTab('generate')}>
          ✦ Generate Tool
        </TabBtn>
      </div>

      {/* ── Registry tab ─────────────────────────────────────────────────── */}
      {activeTab === 'registry' && (
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Tool Registry</h2>
            <p className="text-gray-400 text-sm">
              Approve tool scopes before Claude can use them. All tool calls require explicit permission.
            </p>
          </div>

          {error   && <div className="bg-red-950 border border-red-700 rounded px-4 py-2 text-red-300 text-sm">{error}</div>}
          {success && <div className="bg-green-950 border border-green-700 rounded px-4 py-2 text-green-300 text-sm">{success}</div>}

          <div className="space-y-3">
            {tools.map(tool => (
              <div key={tool.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-white font-semibold">{tool.name}</span>
                      {tool.mcpConfig && (
                        <span className="text-xs bg-purple-900 text-purple-300 px-1.5 py-0.5 rounded border border-purple-700">MCP</span>
                      )}
                      {tool.generatedHandlerPath && (
                        <span className="text-xs bg-indigo-900 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-700">Generated</span>
                      )}
                      <span className={`text-xs font-semibold uppercase ${RISK_COLORS[tool.riskLevel]}`}>
                        {tool.riskLevel} risk
                      </span>
                      {tool.approved
                        ? <span className="text-xs bg-green-900 text-green-300 px-1.5 py-0.5 rounded border border-green-700">✓ Approved</span>
                        : <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded border border-gray-600">Pending</span>
                      }
                      {!tool.enabled && (
                        <span className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">Disabled</span>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm">{tool.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tool.requiredScopes.map(scope => (
                        <span key={scope} className="text-xs bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded font-mono">
                          {scope}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => toggleEnabled(tool)}
                      className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                    >
                      {tool.enabled ? 'Disable' : 'Enable'}
                    </button>
                    {tool.approved ? (
                      <button
                        onClick={() => revokeApproval(tool.id)}
                        className="text-xs px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded transition-colors"
                      >
                        Revoke
                      </button>
                    ) : (
                      <button
                        onClick={() => openApproval(tool)}
                        className="text-xs px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors"
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Install MCP */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-2">Install MCP Tool</h3>
            <p className="text-gray-400 text-sm mb-3">Connect a Model Context Protocol server to add new tools.</p>
            <form onSubmit={installMcp} className="space-y-2">
              <input
                value={installCmd}
                onChange={e => setInstallCmd(e.target.value)}
                placeholder="Command (e.g. npx @anthropic/mcp-server-filesystem)"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <div className="flex gap-2">
                <input
                  value={installName}
                  onChange={e => setInstallName(e.target.value)}
                  placeholder="Display name (optional)"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={installing || !installCmd.trim()}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white rounded text-sm font-semibold transition-colors"
                >
                  {installing ? 'Installing…' : 'Install'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Generate tab ──────────────────────────────────────────────────── */}
      {activeTab === 'generate' && (
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Generate Tool</h2>
            <p className="text-gray-400 text-sm">
              Describe what you want the tool to do. Claude will generate a Node.js handler,
              validate it for safety, and let you review before installing.
            </p>
          </div>

          {genError   && <div className="bg-red-950 border border-red-700 rounded px-4 py-2 text-red-300 text-sm">{genError}</div>}
          {genSuccess && <div className="bg-green-950 border border-green-700 rounded px-4 py-2 text-green-300 text-sm">{genSuccess}</div>}

          {/* Description input */}
          <form onSubmit={handleGenerate} className="space-y-3">
            <textarea
              value={genDesc}
              onChange={e => setGenDesc(e.target.value)}
              rows={4}
              placeholder="e.g. A tool that reads a JSON file and returns a summary of its keys and value types"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-600">
                The generated handler is statically analysed for safety violations before you can install it.
              </p>
              <button
                type="submit"
                disabled={generating || !genDesc.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-sm font-semibold transition-colors shrink-0"
              >
                {generating ? 'Generating…' : '✦ Generate'}
              </button>
            </div>
          </form>

          {/* Proposal card */}
          {proposal && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-800">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-white font-bold">{proposal.name}</span>
                  {proposal.reversible
                    ? <span className="text-xs bg-green-900 text-green-300 px-1.5 py-0.5 rounded border border-green-700">reversible</span>
                    : <span className="text-xs bg-yellow-900 text-yellow-300 px-1.5 py-0.5 rounded border border-yellow-700">irreversible</span>
                  }
                </div>
                <p className="text-gray-400 text-sm">{proposal.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {(proposal.requiredScopes || []).map(s => (
                    <span key={s} className="text-xs bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded font-mono">{s}</span>
                  ))}
                </div>
              </div>

              {/* Safety violations — block install if any */}
              {proposal.violations && proposal.violations.length > 0 && (
                <div className="px-5 py-3 bg-red-950 border-b border-red-800">
                  <div className="text-red-400 text-xs font-semibold mb-1">
                    ⚠ Safety violations detected — installation blocked
                  </div>
                  <ul className="text-red-300 text-xs space-y-0.5">
                    {proposal.violations.map((v, i) => (
                      <li key={i} className="font-mono">• {v}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Code preview */}
              <div className="px-5 py-4">
                <div className="text-xs text-gray-500 mb-2">Generated handler code</div>
                <pre className="bg-gray-950 border border-gray-800 rounded p-3 text-xs text-gray-300 font-mono overflow-x-auto max-h-80 overflow-y-auto whitespace-pre">
                  {proposal.code}
                </pre>
              </div>

              {/* Actions */}
              <div className="px-5 py-4 border-t border-gray-800 flex gap-3 justify-end">
                <button
                  onClick={() => setProposal(null)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
                >
                  Discard
                </button>
                <button
                  onClick={handleInstallGenerated}
                  disabled={installGen || (proposal.violations && proposal.violations.length > 0)}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-sm font-semibold transition-colors"
                  title={proposal.violations?.length > 0 ? 'Fix violations before installing' : ''}
                >
                  {installGen ? 'Installing…' : 'Install tool'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scope approval modal */}
      {selectedTool && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white mb-1">Approve Scopes: {selectedTool.name}</h3>
            <p className="text-gray-400 text-sm mb-4">
              Select which permissions to grant this tool. All required scopes must be approved.
            </p>
            <div className="space-y-2 mb-4">
              {selectedTool.requiredScopes.map(scope => (
                <ScopeApprovalCard
                  key={scope}
                  scope={scope}
                  scopeDef={scopes[scope]}
                  selected={selectedScopes.includes(scope)}
                  onToggle={toggleScope}
                />
              ))}
            </div>
            {error && (
              <div className="mb-3 bg-red-950 border border-red-700 rounded px-3 py-2 text-red-300 text-sm">{error}</div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setSelectedTool(null)} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors">
                Cancel
              </button>
              <button onClick={approveScopes} className="flex-1 px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded text-sm font-semibold transition-colors">
                Approve Selected Scopes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

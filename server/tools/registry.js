const crypto = require('crypto')
const { getDb } = require('../db/client')

// Hardcoded scope taxonomy — not user-extensible
const SCOPES = {
  // Filesystem
  'fs:read':   { label: 'Read files', risk: 'low', description: 'Read file contents from disk' },
  'fs:write':  { label: 'Write/edit files', risk: 'medium', description: 'Create or modify files on disk' },
  'fs:delete': { label: 'Delete files', risk: 'high', description: 'Permanently delete files from disk' },

  // Network
  'net:fetch': { label: 'Fetch URLs', risk: 'low', description: 'Read-only HTTP GET requests to URLs' },
  'net:post':  { label: 'Send HTTP requests', risk: 'medium', description: 'POST/PUT/DELETE HTTP requests' },

  // Shell
  'shell:read': { label: 'Run read-only commands', risk: 'medium', description: 'ls, cat, grep and other read-only shell commands' },
  'shell:exec': { label: 'Execute shell commands', risk: 'high', description: 'Run any shell command on your system' },

  // Email
  'email:read': { label: 'Read emails', risk: 'medium', description: 'Access email content from your mailbox' },
  'email:send': { label: 'Send emails', risk: 'high', description: 'Send emails on your behalf' },

  // Calendar
  'calendar:read':  { label: 'Read calendar', risk: 'low', description: 'View your calendar events' },
  'calendar:write': { label: 'Modify calendar', risk: 'medium', description: 'Create, edit, or delete calendar events' },

  // Browser
  'browser:navigate': { label: 'Open URLs', risk: 'low', description: 'Open web pages in a browser' },
  'browser:fill':     { label: 'Fill web forms', risk: 'high', description: 'Enter data into websites on your behalf' },
}

/**
 * Derive risk level from a list of scopes
 */
function getRiskLevel(scopes) {
  const risks = scopes.map(s => SCOPES[s]?.risk || 'unknown')
  if (risks.includes('high')) return 'high'
  if (risks.includes('medium')) return 'medium'
  if (risks.includes('low')) return 'low'
  return 'unknown'
}

/**
 * Check if a tool can be invoked (scopes approved)
 */
function canInvokeTool(toolId) {
  const db = getDb()

  const tool = db.prepare('SELECT required_scopes FROM tool_registry WHERE id = ? AND enabled = 1').get(toolId)
  if (!tool) throw new Error('Tool not found or disabled')

  const requiredScopes = JSON.parse(tool.required_scopes)

  const approval = db.prepare('SELECT scopes FROM approved_scopes WHERE tool_id = ?').get(toolId)
  if (!approval) throw new Error(`Tool "${toolId}" scopes not yet approved. Please approve them in the Tools page.`)

  const approvedScopes = JSON.parse(approval.scopes)

  for (const scope of requiredScopes) {
    if (!approvedScopes.includes(scope)) {
      throw new Error(`Missing required scope approval: ${scope}`)
    }
  }

  return true
}

/**
 * List all tools in registry
 */
function listTools() {
  const db = getDb()
  const tools = db.prepare('SELECT * FROM tool_registry ORDER BY created_at ASC').all()
  const approvals = db.prepare('SELECT * FROM approved_scopes').all()
  const approvalMap = Object.fromEntries(approvals.map(a => [a.tool_id, JSON.parse(a.scopes)]))

  return tools.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    requiredScopes: JSON.parse(t.required_scopes),
    riskLevel: t.risk_level,
    reversible: !!t.reversible,
    sandboxed: !!t.sandboxed,
    timeoutMs: t.timeout_ms,
    enabled: !!t.enabled,
    mcpConfig: t.mcp_config ? JSON.parse(t.mcp_config) : null,
    approved: !!approvalMap[t.id],
    approvedScopes: approvalMap[t.id] || [],
    createdAt: t.created_at
  }))
}

/**
 * Get single tool
 */
function getTool(id) {
  const db = getDb()
  const t = db.prepare('SELECT * FROM tool_registry WHERE id = ?').get(id)
  if (!t) return null
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    requiredScopes: JSON.parse(t.required_scopes),
    riskLevel: t.risk_level,
    reversible: !!t.reversible,
    sandboxed: !!t.sandboxed,
    timeoutMs: t.timeout_ms,
    enabled: !!t.enabled,
    mcpConfig: t.mcp_config ? JSON.parse(t.mcp_config) : null,
    createdAt: t.created_at
  }
}

/**
 * Approve scopes for a tool
 */
function approveScopes(toolId, scopes) {
  const db = getDb()

  // Validate scopes are known
  for (const scope of scopes) {
    if (!SCOPES[scope]) throw new Error(`Unknown scope: ${scope}`)
  }

  db.prepare(`
    INSERT OR REPLACE INTO approved_scopes (tool_id, scopes, approved_at)
    VALUES (?, ?, datetime('now'))
  `).run(toolId, JSON.stringify(scopes))
}

/**
 * Revoke scope approval for a tool
 */
function revokeApproval(toolId) {
  const db = getDb()
  db.prepare('DELETE FROM approved_scopes WHERE tool_id = ?').run(toolId)
}

/**
 * Register a new tool (used for builtins and MCP tools)
 */
function registerTool({ id, name, description, requiredScopes, reversible, sandboxed, timeoutMs, mcpConfig }) {
  const db = getDb()
  const toolId = id || crypto.randomUUID()
  const riskLevel = getRiskLevel(requiredScopes)

  db.prepare(`
    INSERT OR IGNORE INTO tool_registry
    (id, name, description, required_scopes, risk_level, reversible, sandboxed, timeout_ms, mcp_config)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    toolId,
    name,
    description || '',
    JSON.stringify(requiredScopes),
    riskLevel,
    reversible ? 1 : 0,
    sandboxed !== false ? 1 : 0,
    timeoutMs || 10000,
    mcpConfig ? JSON.stringify(mcpConfig) : null
  )

  return toolId
}

/**
 * Update tool settings
 */
function updateTool(id, { enabled, timeoutMs }) {
  const db = getDb()
  const updates = []
  const params = []

  if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0) }
  if (timeoutMs !== undefined) { updates.push('timeout_ms = ?'); params.push(timeoutMs) }

  if (updates.length === 0) return
  params.push(id)
  db.prepare(`UPDATE tool_registry SET ${updates.join(', ')} WHERE id = ?`).run(...params)
}

/**
 * Remove a tool
 */
function removeTool(id) {
  const db = getDb()
  db.prepare('DELETE FROM tool_registry WHERE id = ?').run(id)
}

module.exports = {
  SCOPES,
  getRiskLevel,
  canInvokeTool,
  listTools,
  getTool,
  approveScopes,
  revokeApproval,
  registerTool,
  updateTool,
  removeTool
}

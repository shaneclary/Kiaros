const { getDb } = require('../db/client')
const { getRiskLevel, SCOPES } = require('./scopes')

// Built-in tool implementations
const BUILTIN_TOOLS = {
  'file-reader': {
    name: 'File Reader',
    description: 'Read file contents from the local filesystem',
    requiredScopes: ['fs:read'],
    reversible: false,
    timeoutMs: 5000,
    async execute(input) {
      const fs = require('fs').promises
      if (!input.path) throw new Error('Missing path')
      if (input.path.includes('..')) throw new Error('Path traversal not allowed')
      const stats = await fs.stat(input.path)
      if (stats.size > 1024 * 1024) throw new Error('File too large (max 1MB)')
      const content = await fs.readFile(input.path, 'utf-8')
      return { path: input.path, content, size: stats.size }
    }
  },
  'file-writer': {
    name: 'File Writer',
    description: 'Write content to files on the local filesystem',
    requiredScopes: ['fs:write'],
    reversible: true,
    timeoutMs: 5000,
    async execute(input) {
      const fs = require('fs').promises
      if (!input.path || !input.content) throw new Error('Missing path or content')
      if (input.path.includes('..')) throw new Error('Path traversal not allowed')
      let undoData = null
      try {
        const existing = await fs.readFile(input.path, 'utf-8')
        undoData = { path: input.path, content: existing }
      } catch { /* new file */ }
      await fs.writeFile(input.path, input.content, 'utf-8')
      return { path: input.path, written: input.content.length, undoData }
    }
  },
  'web-fetch': {
    name: 'Web Fetch',
    description: 'Fetch content from a URL (GET only)',
    requiredScopes: ['net:fetch'],
    reversible: false,
    timeoutMs: 10000,
    async execute(input) {
      if (!input.url) throw new Error('Missing url')
      const url = new URL(input.url)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) allowed')
      const resp = await fetch(input.url, { signal: AbortSignal.timeout(8000) })
      const text = await resp.text()
      return { url: input.url, status: resp.status, body: text.substring(0, 50000) }
    }
  },
  'shell-exec': {
    name: 'Shell Command',
    description: 'Execute a shell command and return output',
    requiredScopes: ['shell:exec'],
    reversible: false,
    timeoutMs: 30000,
    async execute(input) {
      const { execSync } = require('child_process')
      if (!input.command) throw new Error('Missing command')
      const output = execSync(input.command, {
        timeout: 25000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf-8'
      })
      return { command: input.command, output: output.substring(0, 50000) }
    }
  },
  'memory-store': {
    name: 'Memory Store',
    description: 'Store a key-value pair in working memory',
    requiredScopes: ['memory:write'],
    reversible: true,
    timeoutMs: 1000,
    async execute(input) {
      const working = require('../memory/working')
      if (!input.key || !input.value) throw new Error('Missing key or value')
      const existing = working.get(input.key)
      working.set(input.key, input.value, 'ai_derived')
      return { key: input.key, stored: true, undoData: existing ? { key: input.key, value: existing.value } : null }
    }
  }
}

function seedBuiltinTools() {
  const db = getDb()
  for (const [id, tool] of Object.entries(BUILTIN_TOOLS)) {
    const existing = db.prepare('SELECT id FROM tool_registry WHERE id = ?').get(id)
    if (!existing) {
      db.prepare(`
        INSERT INTO tool_registry (id, name, description, required_scopes, risk_level, reversible, timeout_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, tool.name, tool.description, JSON.stringify(tool.requiredScopes),
        getRiskLevel(tool.requiredScopes), tool.reversible ? 1 : 0, tool.timeoutMs)
    }
  }
}

function listTools() {
  const db = getDb()
  const tools = db.prepare('SELECT * FROM tool_registry WHERE enabled = 1 ORDER BY name').all()
  return tools.map(t => {
    const approval = db.prepare('SELECT * FROM approved_scopes WHERE tool_id = ?').get(t.id)
    return {
      ...t,
      required_scopes: JSON.parse(t.required_scopes),
      approved: !!approval,
      approved_scopes: approval ? JSON.parse(approval.scopes) : []
    }
  })
}

function approveScopes(toolId, scopes) {
  const db = getDb()
  db.prepare(`
    INSERT INTO approved_scopes (tool_id, scopes)
    VALUES (?, ?)
    ON CONFLICT(tool_id) DO UPDATE SET scopes = ?, approved_at = datetime('now')
  `).run(toolId, JSON.stringify(scopes), JSON.stringify(scopes))
}

function revokeScopes(toolId) {
  const db = getDb()
  db.prepare('DELETE FROM approved_scopes WHERE tool_id = ?').run(toolId)
}

function canInvokeTool(toolId) {
  const db = getDb()
  const tool = db.prepare('SELECT required_scopes FROM tool_registry WHERE id = ? AND enabled = 1').get(toolId)
  if (!tool) throw new Error('Tool not found or disabled')

  const required = JSON.parse(tool.required_scopes)
  const approval = db.prepare('SELECT scopes FROM approved_scopes WHERE tool_id = ?').get(toolId)
  if (!approval) throw new Error('Tool scopes not approved by user')

  const approved = JSON.parse(approval.scopes)
  for (const scope of required) {
    if (!approved.includes(scope)) throw new Error(`Missing required scope: ${scope}`)
  }
  return true
}

async function executeTool(toolId, input) {
  const builtin = BUILTIN_TOOLS[toolId]
  if (builtin) return await builtin.execute(input)
  throw new Error(`Tool ${toolId} has no registered executor`)
}

function getToolDefinitions() {
  // Return tool definitions in Anthropic tool-use format
  return Object.entries(BUILTIN_TOOLS).map(([id, tool]) => ({
    name: id,
    description: tool.description,
    input_schema: getToolSchema(id)
  }))
}

function getToolSchema(toolId) {
  const schemas = {
    'file-reader': {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path to read' } },
      required: ['path']
    },
    'file-writer': {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['path', 'content']
    },
    'web-fetch': {
      type: 'object',
      properties: { url: { type: 'string', description: 'URL to fetch' } },
      required: ['url']
    },
    'shell-exec': {
      type: 'object',
      properties: { command: { type: 'string', description: 'Shell command to execute' } },
      required: ['command']
    },
    'memory-store': {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memory key' },
        value: { type: 'string', description: 'Memory value' }
      },
      required: ['key', 'value']
    }
  }
  return schemas[toolId] || { type: 'object', properties: {} }
}

module.exports = {
  BUILTIN_TOOLS, seedBuiltinTools,
  listTools, approveScopes, revokeScopes, canInvokeTool,
  executeTool, getToolDefinitions, getToolSchema
}

const express = require('express')
const router = express.Router()
const { requireAuth } = require('../auth/passphrase')
const {
  listTools, getTool, approveScopes, revokeApproval,
  updateTool, removeTool, SCOPES
} = require('../tools/registry')
const { discoverAndRegister } = require('../tools/mcp-discovery')
const { resolveInterrupt, getPendingInterrupts } = require('../orchestration/interrupt-gate')
const { generateToolProposal, installGeneratedTool } = require('../tools/generator')
const { getDecryptedKey, getActiveCredentialId, listCredentials } = require('../credentials/manager')

router.use(requireAuth)

// GET /api/tools — List all tools with approval status
router.get('/', (req, res) => {
  try {
    res.json({
      tools: listTools(),
      scopes: SCOPES
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/tools/:id/approve — Approve scopes for a tool
router.post('/:id/approve', (req, res) => {
  try {
    const { scopes } = req.body
    if (!Array.isArray(scopes)) {
      return res.status(400).json({ error: 'scopes must be an array' })
    }
    approveScopes(req.params.id, scopes)
    res.json({ ok: true, tool: getTool(req.params.id) })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/tools/:id/approve — Revoke scope approval
router.delete('/:id/approve', (req, res) => {
  try {
    revokeApproval(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/tools/install — Install new MCP tool via discovery
router.post('/install', async (req, res) => {
  try {
    const { command, args, displayName, requiredScopes } = req.body
    if (!command) return res.status(400).json({ error: 'command is required' })

    // Discovery spawns the MCP server briefly to enumerate its tools,
    // then registers each one in the tool_registry table.
    const ids = await discoverAndRegister({ command, args, displayName, requiredScopes })
    res.json({ ok: true, installedIds: ids, tools: listTools() })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PUT /api/tools/:id — Update tool settings
router.put('/:id', (req, res) => {
  try {
    const { enabled, timeoutMs } = req.body
    updateTool(req.params.id, { enabled, timeoutMs })
    res.json({ ok: true, tool: getTool(req.params.id) })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/tools/:id — Remove tool
router.delete('/:id', (req, res) => {
  try {
    // Prevent deletion of builtins
    const builtins = ['file-reader', 'file-writer', 'web-fetch', 'note-taker']
    if (builtins.includes(req.params.id)) {
      return res.status(400).json({ error: 'Cannot delete built-in tools. Disable them instead.' })
    }
    removeTool(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/tools/interrupts/pending — Get pending interrupt requests
router.get('/interrupts/pending', (req, res) => {
  try {
    res.json(getPendingInterrupts())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/tools/interrupts/:id/resolve — Resolve an interrupt
router.post('/interrupts/:id/resolve', (req, res) => {
  try {
    const { approved } = req.body
    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'approved must be a boolean' })
    }
    resolveInterrupt(req.params.id, approved)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/tools/generate — Ask Claude to generate a skill from a description
// Returns a proposal for human review; does NOT install anything.
router.post('/generate', async (req, res) => {
  try {
    const { description, credentialId } = req.body
    if (!description || typeof description !== 'string') {
      return res.status(400).json({ error: 'description is required' })
    }
    if (description.length > 2000) {
      return res.status(400).json({ error: 'description too long (max 2000 chars)' })
    }

    const activeCredId = credentialId || getActiveCredentialId()
    if (!activeCredId) return res.status(400).json({ error: 'No API key configured' })

    let apiKey
    try {
      apiKey = getDecryptedKey(activeCredId, req.encKey)
    } catch {
      return res.status(400).json({ error: 'Failed to retrieve API key' })
    }

    const creds = listCredentials()
    const activeCred = creds.find(c => c.id === activeCredId)
    const model = activeCred?.model || 'claude-sonnet-4-20250514'

    try {
      const proposal = await generateToolProposal(description, apiKey, model)
      res.json({ ok: true, proposal })
    } finally {
      apiKey = null
    }
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/tools/install-generated — Install a reviewed and approved skill proposal
router.post('/install-generated', (req, res) => {
  try {
    const { id, name, description, requiredScopes, reversible, code } = req.body
    if (!id || !name || !code) {
      return res.status(400).json({ error: 'id, name, and code are required' })
    }

    const { toolId, handlerPath } = installGeneratedTool({ id, name, description, requiredScopes, reversible, code })
    res.json({ ok: true, toolId, handlerPath: handlerPath.split('/').pop(), tools: listTools() })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router

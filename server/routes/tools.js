const express = require('express')
const router = express.Router()
const { requireAuth } = require('../auth/passphrase')
const {
  listTools, getTool, approveScopes, revokeApproval,
  updateTool, removeTool, SCOPES
} = require('../tools/registry')
const { discoverAndRegister } = require('../tools/mcp-discovery')
const { resolveInterrupt, getPendingInterrupts } = require('../orchestration/interrupt-gate')

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

module.exports = router

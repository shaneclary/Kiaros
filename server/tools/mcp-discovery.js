/**
 * MCP Tool Discovery
 *
 * Responsible for querying a running MCP server's capabilities and mapping
 * them to Kiaros tool registry entries. Separated from mcp-runner.js
 * (which handles subprocess lifecycle) to keep concerns clean.
 *
 * Security: discovery never passes the API key or session data to the MCP
 * process. It only sends the MCP protocol's `tools/list` call.
 */

const { spawn } = require('child_process')
const crypto = require('crypto')
const { registerTool, getRiskLevel } = require('./registry')

/**
 * Query an MCP server for its available tools by spawning it briefly,
 * sending `tools/list`, and killing the process when done.
 *
 * @param {{ command: string, args?: string[] }} config
 * @param {{ timeoutMs?: number }} opts
 * @returns {Promise<Array<{ name: string, description: string, inputSchema: object }>>}
 */
async function discoverMcpTools(config, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    // Sanitized environment — never pass API keys or session data
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
    }

    const proc = spawn(config.command, config.args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      shell: false // prevent shell injection
    })

    let stdout = ''
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        proc.kill('SIGTERM')
        reject(new Error(`MCP discovery timed out after ${timeoutMs}ms`))
      }
    }, timeoutMs)

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      // Try to parse responses as they arrive (line-delimited JSON-RPC)
      tryResolveFromBuffer()
    })

    proc.stderr.on('data', (chunk) => {
      // Suppress stderr from MCP process — don't leak internal server details
    })

    proc.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error(`Failed to start MCP server: ${err.message}`))
      }
    })

    proc.on('exit', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error(`MCP server exited unexpectedly (code ${code})`))
      }
    })

    // Send initialize + tools/list once the process is ready
    const initId = crypto.randomUUID()
    const listId = crypto.randomUUID()
    let initDone = false

    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'kiaros-discovery', version: '2.0.0' }
      },
      id: initId
    }) + '\n'

    proc.stdin.write(initRequest)

    function tryResolveFromBuffer() {
      const lines = stdout.split('\n')

      for (const line of lines) {
        if (!line.trim()) continue
        let msg
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }

        if (msg.id === initId && !initDone) {
          // Initialize succeeded — now request tool list
          initDone = true
          const listRequest = JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/list',
            params: {},
            id: listId
          }) + '\n'
          proc.stdin.write(listRequest)
        }

        if (msg.id === listId) {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            proc.kill('SIGTERM')

            const tools = msg.result?.tools || []
            resolve(tools.map(t => ({
              name: t.name,
              description: t.description || '',
              inputSchema: t.inputSchema || {}
            })))
          }
        }
      }
    }
  })
}

/**
 * Discover tools from an MCP server and register them in the tool registry.
 * Returns the list of registered tool IDs.
 *
 * @param {{ command: string, args?: string[], requiredScopes?: string[], displayName?: string }} opts
 * @returns {Promise<string[]>} registered tool IDs
 */
async function discoverAndRegister(opts) {
  const tools = await discoverMcpTools({
    command: opts.command,
    args: opts.args || []
  })

  const registeredIds = []

  for (const tool of tools) {
    const toolId = `mcp-${tool.name.replace(/[^a-zA-Z0-9-_]/g, '-')}`
    const requiredScopes = opts.requiredScopes || ['shell:exec']

    const id = registerTool({
      id: toolId,
      name: opts.displayName ? `${opts.displayName}: ${tool.name}` : tool.name,
      description: tool.description,
      requiredScopes,
      reversible: false,
      sandboxed: true,
      timeoutMs: 10000,
      mcpConfig: {
        command: opts.command,
        args: opts.args || [],
        method: 'tools/call',
        toolName: tool.name
      }
    })

    registeredIds.push(id)
  }

  // If the server returned no tools, register it as a single generic tool
  if (registeredIds.length === 0) {
    const fallbackId = `mcp-${Date.now()}`
    const id = registerTool({
      id: fallbackId,
      name: opts.displayName || opts.command,
      description: `MCP server: ${opts.command}`,
      requiredScopes: opts.requiredScopes || ['shell:exec'],
      reversible: false,
      sandboxed: true,
      timeoutMs: 10000,
      mcpConfig: {
        command: opts.command,
        args: opts.args || []
      }
    })
    registeredIds.push(id)
  }

  return registeredIds
}

module.exports = { discoverMcpTools, discoverAndRegister }

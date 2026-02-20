const { spawn } = require('child_process')
const crypto = require('crypto')
const { getDb } = require('../db/client')

// Active MCP server processes: toolId -> MCPServerInstance
const activeServers = new Map()

class MCPServer {
  constructor(config) {
    this.command = config.command
    this.args = config.args || []
    this.toolId = config.toolId
    this.timeout = config.timeoutMs || 10000
    this.process = null
    this.buffer = ''
    this.pending = new Map() // requestId -> { resolve, reject }
    this.ready = false
  }

  async start() {
    // Sanitized environment — NEVER pass API keys
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      // Only necessary env vars, not the full process.env
    }

    this.process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      shell: false // Security: prevent shell injection
    })

    this.process.stdout.on('data', (data) => {
      this.buffer += data.toString()
      this._processBuffer()
    })

    this.process.stderr.on('data', (data) => {
      // Log stderr but don't expose in outputs
      console.error(`[MCP ${this.toolId}] stderr:`, data.toString().substring(0, 200))
    })

    this.process.on('exit', (code) => {
      console.log(`[MCP ${this.toolId}] Process exited with code ${code}`)
      // Reject all pending requests
      for (const [id, { reject }] of this.pending.entries()) {
        reject(new Error('MCP process exited unexpectedly'))
      }
      this.pending.clear()
      activeServers.delete(this.toolId)
    })

    // Send initialize request
    await this._send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'kiaros', version: '2.0.0' }
    })

    this.ready = true
  }

  _processBuffer() {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() // Keep incomplete last line

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)
          this.pending.delete(msg.id)
          if (msg.error) {
            reject(new Error(msg.error.message || 'MCP error'))
          } else {
            resolve(msg.result)
          }
        }
      } catch (err) {
        // Ignore non-JSON output
      }
    }
  }

  _send(method, params) {
    const id = crypto.randomUUID()
    const request = JSON.stringify({ jsonrpc: '2.0', method, params, id }) + '\n'

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP call timeout (${this.timeout}ms)`))
      }, this.timeout)

      this.pending.set(id, {
        resolve: (result) => { clearTimeout(timer); resolve(result) },
        reject: (err) => { clearTimeout(timer); reject(err) }
      })

      if (!this.process || !this.process.stdin.writable) {
        this.pending.delete(id)
        clearTimeout(timer)
        return reject(new Error('MCP process not running'))
      }

      this.process.stdin.write(request)
    })
  }

  async invoke(method, params) {
    if (!this.ready) throw new Error('MCP server not initialized')

    // Validate input size
    if (JSON.stringify(params).length > 10000) {
      throw new Error('Input too large (max 10KB)')
    }

    const result = await this._send(method, params)

    // Validate output structure
    if (typeof result !== 'object' && result !== null) {
      throw new Error('Invalid MCP response structure')
    }

    return result
  }

  async listTools() {
    const result = await this._send('tools/list', {})
    return result?.tools || []
  }

  stop() {
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
    }
  }
}

/**
 * Invoke a tool via its MCP server
 * Starts the server if not running
 */
async function invokeMcpTool(toolId, input, timeoutMs) {
  const db = getDb()
  const tool = db.prepare('SELECT mcp_config FROM tool_registry WHERE id = ?').get(toolId)
  if (!tool || !tool.mcp_config) throw new Error('Tool MCP config not found')

  const mcpConfig = JSON.parse(tool.mcp_config)

  let server = activeServers.get(toolId)
  if (!server) {
    server = new MCPServer({
      command: mcpConfig.command,
      args: mcpConfig.args || [],
      toolId,
      timeoutMs: timeoutMs || 10000
    })
    await server.start()
    activeServers.set(toolId, server)
  }

  return await server.invoke(
    mcpConfig.method || 'tools/call',
    { name: mcpConfig.toolName, arguments: input }
  )
}

/**
 * Shutdown all MCP servers (call on process exit)
 */
function shutdownAll() {
  for (const server of activeServers.values()) {
    server.stop()
  }
  activeServers.clear()
}

process.on('SIGTERM', shutdownAll)
process.on('SIGINT', shutdownAll)

module.exports = { invokeMcpTool, shutdownAll }

const fs = require('fs').promises
const path = require('path')

/**
 * Read a file from disk.
 * Security: path traversal blocked, 1MB size limit.
 * Required scopes: fs:read
 */
async function readFile(input) {
  if (!input.path) throw new Error('Missing required field: path')

  // Block path traversal
  const resolved = path.resolve(input.path)
  if (input.path.includes('..')) throw new Error('Path traversal not allowed')

  const stats = await fs.stat(resolved)
  if (stats.size > 1024 * 1024) throw new Error('File too large (max 1MB)')
  if (!stats.isFile()) throw new Error('Path is not a file')

  const content = await fs.readFile(resolved, 'utf-8')

  return {
    path: resolved,
    content,
    sizeBytes: stats.size
  }
}

module.exports = { readFile }

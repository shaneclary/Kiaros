const fs = require('fs').promises
const path = require('path')

/**
 * Write content to a file.
 * Security: path traversal blocked, 10MB content limit.
 * Stores previous content as undo data if file exists.
 * Required scopes: fs:write
 */
async function writeFile(input) {
  if (!input.path) throw new Error('Missing required field: path')
  if (input.content === undefined) throw new Error('Missing required field: content')

  if (input.path.includes('..')) throw new Error('Path traversal not allowed')

  const resolved = path.resolve(input.path)

  if (typeof input.content !== 'string') throw new Error('content must be a string')
  if (input.content.length > 10 * 1024 * 1024) throw new Error('Content too large (max 10MB)')

  // Store previous content for undo
  let previousContent = null
  let previouslyExisted = false
  try {
    previousContent = await fs.readFile(resolved, 'utf-8')
    previouslyExisted = true
  } catch {
    // File didn't exist — undo will delete it
  }

  // Ensure parent directory exists
  await fs.mkdir(path.dirname(resolved), { recursive: true })
  await fs.writeFile(resolved, input.content, 'utf-8')

  return {
    path: resolved,
    bytesWritten: Buffer.byteLength(input.content),
    // Undo data: restore previous state
    undoData: {
      path: resolved,
      previousContent,
      previouslyExisted
    }
  }
}

module.exports = { writeFile }

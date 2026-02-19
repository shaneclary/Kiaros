const fs = require('fs').promises
const path = require('path')
const crypto = require('crypto')

const NOTES_DIR = path.join(__dirname, '../../../notes')

/**
 * Write a note to the notes directory.
 * Security: writes only to the notes/ subdirectory, filename sanitized.
 * Required scopes: fs:write
 */
async function writeNote(input) {
  if (!input.content) throw new Error('Missing required field: content')

  // Ensure notes directory exists
  await fs.mkdir(NOTES_DIR, { recursive: true })

  // Sanitize or generate filename
  let filename = input.filename || `note-${Date.now()}.txt`
  // Remove path separators from filename
  filename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_')
  if (!filename) filename = `note-${crypto.randomUUID()}.txt`

  const filePath = path.join(NOTES_DIR, filename)

  if (input.content.length > 1024 * 1024) {
    throw new Error('Note content too large (max 1MB)')
  }

  // Check if file exists for undo
  let previousContent = null
  let previouslyExisted = false
  try {
    previousContent = await fs.readFile(filePath, 'utf-8')
    previouslyExisted = true
  } catch {
    // File didn't exist
  }

  await fs.writeFile(filePath, input.content, 'utf-8')

  return {
    path: filePath,
    filename,
    bytesWritten: Buffer.byteLength(input.content),
    undoData: { path: filePath, previousContent, previouslyExisted }
  }
}

module.exports = { writeNote }

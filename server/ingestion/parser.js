/**
 * Kiaros Document Parser
 *
 * Extracts plain-text content from various file formats.
 *
 * Supported formats:
 *   Plain text  — .txt .md .rst .csv .log .yaml .yml .toml
 *   JSON        — .json (pretty-printed key paths)
 *   HTML/XML    — .html .htm .xml (tag stripping)
 *   PDF         — .pdf (via system `pdftotext`, optional)
 *   Source code — .js .ts .py .sh .rb .go .rs .c .cpp .java (as-is)
 *
 * Returns { text: string, mimeType: string } or throws on unreadable binary.
 */

'use strict'

const fs     = require('fs')
const path   = require('path')
const { execFileSync } = require('child_process')

// ── MIME / extension mapping ───────────────────────────────────────────────
const PLAIN_TEXT_EXTS = new Set([
  '.txt', '.md', '.markdown', '.rst', '.csv', '.log',
  '.yaml', '.yml', '.toml', '.ini', '.conf', '.env',
  '.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx',
  '.py', '.rb', '.sh', '.bash', '.zsh', '.fish',
  '.go', '.rs', '.c', '.cpp', '.h', '.hpp',
  '.java', '.kt', '.swift', '.cs',
  '.sql', '.graphql', '.proto',
  '.r', '.lua', '.pl', '.ex', '.exs',
])

const MAX_BYTES = 5 * 1024 * 1024  // 5 MB per file

// ── Helpers ────────────────────────────────────────────────────────────────

/** Strip HTML/XML tags; collapse whitespace */
function stripHtml(raw) {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Flatten a JSON value to readable key=value lines */
function flattenJson(obj, prefix = '', lines = []) {
  if (obj === null || typeof obj !== 'object') {
    lines.push(`${prefix} = ${JSON.stringify(obj)}`)
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => flattenJson(v, `${prefix}[${i}]`, lines))
  } else {
    for (const [k, v] of Object.entries(obj)) {
      flattenJson(v, prefix ? `${prefix}.${k}` : k, lines)
    }
  }
  return lines
}

/** Check if buffer looks like binary (>5% null/control bytes) */
function looksLikeBinary(buf) {
  const check = buf.slice(0, Math.min(512, buf.length))
  let badBytes = 0
  for (let i = 0; i < check.length; i++) {
    const b = check[i]
    if (b === 0 || (b < 9 && b !== 7 && b !== 8)) badBytes++
  }
  return badBytes / check.length > 0.05
}

// ── PDF extraction via pdftotext ───────────────────────────────────────────
let pdftotextAvailable = null  // null = unchecked, true/false after first call

function pdfToText(filePath) {
  if (pdftotextAvailable === false) throw new Error('pdftotext not available')
  try {
    const out = execFileSync('pdftotext', [filePath, '-'], {
      timeout: 30000,
      maxBuffer: MAX_BYTES,
    })
    pdftotextAvailable = true
    return out.toString('utf-8')
  } catch (err) {
    if (pdftotextAvailable === null) {
      // First failure — check if binary missing
      if (err.code === 'ENOENT' || err.code === 127) {
        pdftotextAvailable = false
        throw new Error('pdftotext not installed (apt install poppler-utils)')
      }
    }
    throw new Error(`pdftotext failed: ${err.message}`)
  }
}

// ── Main parse function ────────────────────────────────────────────────────

/**
 * Parse a file and return its text content.
 *
 * @param {string} filePath  Absolute path to the file
 * @returns {{ text: string, mimeType: string }}
 * @throws {Error}  On binary files, missing pdftotext, oversized files, etc.
 */
function parseFile(filePath) {
  const stat = fs.statSync(filePath)
  if (stat.size > MAX_BYTES) {
    throw new Error(`File too large: ${(stat.size / 1024 / 1024).toFixed(1)} MB (max 5 MB)`)
  }

  const ext  = path.extname(filePath).toLowerCase()
  const buf  = fs.readFileSync(filePath)

  // ── PDF ──────────────────────────────────────────────────────────────────
  if (ext === '.pdf') {
    const text = pdfToText(filePath)
    return { text: text.replace(/\s+/g, ' ').trim(), mimeType: 'application/pdf' }
  }

  // ── HTML / XML ───────────────────────────────────────────────────────────
  if (ext === '.html' || ext === '.htm') {
    const raw = buf.toString('utf-8')
    return { text: stripHtml(raw), mimeType: 'text/html' }
  }
  if (ext === '.xml') {
    const raw = buf.toString('utf-8')
    return { text: stripHtml(raw), mimeType: 'application/xml' }
  }

  // ── JSON ─────────────────────────────────────────────────────────────────
  if (ext === '.json' || ext === '.jsonl') {
    try {
      const obj = JSON.parse(buf.toString('utf-8'))
      const lines = flattenJson(obj)
      return { text: lines.join('\n'), mimeType: 'application/json' }
    } catch {
      // Not valid JSON — treat as plain text
    }
  }

  // ── Plain text / source code ─────────────────────────────────────────────
  if (PLAIN_TEXT_EXTS.has(ext)) {
    return { text: buf.toString('utf-8'), mimeType: 'text/plain' }
  }

  // ── Unknown extension — sniff for binary ─────────────────────────────────
  if (looksLikeBinary(buf)) {
    throw new Error(`Binary file not supported (${ext || 'no extension'})`)
  }

  // Attempt UTF-8 decode
  return { text: buf.toString('utf-8'), mimeType: 'text/plain' }
}

module.exports = { parseFile }

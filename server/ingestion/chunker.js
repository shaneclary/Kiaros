/**
 * Kiaros Text Chunker
 *
 * Splits a text document into overlapping chunks suitable for embedding.
 *
 * Strategy:
 *   - Target ~512 tokens per chunk (estimated as chars / 4)
 *   - 10% overlap (stride = chunk_chars * 0.9)
 *   - Split at paragraph boundaries when possible, else at sentence
 *     boundaries (. ! ?), else at word boundaries, else hard cut.
 *
 * Each chunk carries:
 *   { index, text, charStart, charEnd, tokenEstimate }
 */

'use strict'

const CHUNK_CHARS   = 2048  // ≈ 512 tokens @ 4 chars/token
const OVERLAP_CHARS = 205   // ≈ 10% overlap
const STRIDE        = CHUNK_CHARS - OVERLAP_CHARS  // 1843

// ── Paragraph-aware splitter ───────────────────────────────────────────────

/**
 * Find the best split boundary ≤ maxPos, preferring \n\n, then \n, then
 * sentence terminators (. ! ?), then spaces, else returning maxPos.
 */
function findSplitBoundary(text, start, maxPos) {
  if (maxPos >= text.length) return text.length

  // Look backward from maxPos for paragraph break
  const pBreak = text.lastIndexOf('\n\n', maxPos)
  if (pBreak > start) return pBreak + 2

  // Single newline
  const nBreak = text.lastIndexOf('\n', maxPos)
  if (nBreak > start) return nBreak + 1

  // Sentence terminator
  for (let i = maxPos; i > start; i--) {
    const c = text[i]
    if ((c === '.' || c === '!' || c === '?') && (i + 1 >= text.length || text[i + 1] === ' ' || text[i + 1] === '\n')) {
      return i + 1
    }
  }

  // Word boundary (space)
  const spBreak = text.lastIndexOf(' ', maxPos)
  if (spBreak > start) return spBreak + 1

  return maxPos
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Split text into overlapping chunks.
 *
 * @param {string} text  Full document text
 * @param {object} [opts]
 * @param {number} [opts.chunkChars=2048]    Target chars per chunk
 * @param {number} [opts.overlapChars=205]   Overlap between consecutive chunks
 * @returns {Array<{ index: number, text: string, charStart: number, charEnd: number, tokenEstimate: number }>}
 */
function chunkText(text, { chunkChars = CHUNK_CHARS, overlapChars = OVERLAP_CHARS } = {}) {
  const stride = chunkChars - overlapChars
  const chunks = []
  let pos = 0
  let index = 0

  while (pos < text.length) {
    const rawEnd = pos + chunkChars
    const end = rawEnd >= text.length ? text.length : findSplitBoundary(text, pos, rawEnd)

    const chunkText = text.slice(pos, end).trim()
    if (chunkText.length > 0) {
      chunks.push({
        index,
        text:           chunkText,
        charStart:      pos,
        charEnd:        end,
        tokenEstimate:  Math.ceil(chunkText.length / 4),
      })
      index++
    }

    if (end >= text.length) break
    pos = Math.max(pos + 1, end - overlapChars)  // advance with overlap
  }

  return chunks
}

module.exports = { chunkText, CHUNK_CHARS, OVERLAP_CHARS }

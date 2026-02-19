/**
 * Fetch content from a URL (GET only).
 * Security: only HTTPS, response size capped at 512KB.
 * Required scopes: net:fetch
 */
async function webFetch(input) {
  if (!input.url) throw new Error('Missing required field: url')

  let parsedUrl
  try {
    parsedUrl = new URL(input.url)
  } catch {
    throw new Error('Invalid URL')
  }

  // Only allow HTTPS (or HTTP for localhost in dev)
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
    throw new Error('Only HTTPS URLs are allowed')
  }

  // Block private IP ranges
  const hostname = parsedUrl.hostname
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.0\.0\.0)/.test(hostname)) {
    throw new Error('Access to private/internal addresses is not allowed')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  let response
  try {
    response = await fetch(input.url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'Kiaros/2.0 (self-hosted AI assistant)' }
    })
  } finally {
    clearTimeout(timeout)
  }

  // Cap response size at 512KB
  const MAX_SIZE = 512 * 1024
  const reader = response.body.getReader()
  const chunks = []
  let totalSize = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalSize += value.length
    if (totalSize > MAX_SIZE) {
      reader.cancel()
      throw new Error('Response too large (max 512KB)')
    }
    chunks.push(value)
  }

  const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)))
  const text = buffer.toString('utf-8')

  return {
    url: input.url,
    status: response.status,
    contentType: response.headers.get('content-type') || 'unknown',
    sizeBytes: totalSize,
    content: text
  }
}

module.exports = { webFetch }

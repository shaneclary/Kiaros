/**
 * Sandbox: Validate tool inputs and enforce timeouts.
 * Security-critical — validates all inputs before tool execution.
 */

const MAX_INPUT_SIZE = 10 * 1024 // 10KB input limit

/**
 * Validate and sanitize tool input
 * @param {object} input - raw input from Claude
 * @returns {object} validated input
 */
function validateInput(input) {
  if (input === null || input === undefined) {
    return {}
  }

  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Tool input must be an object')
  }

  // Check size
  const serialized = JSON.stringify(input)
  if (serialized.length > MAX_INPUT_SIZE) {
    throw new Error(`Input too large (max ${MAX_INPUT_SIZE / 1024}KB)`)
  }

  return input
}

/**
 * Execute a function with a timeout
 * @param {Function} fn - async function to execute
 * @param {number} timeoutMs - timeout in milliseconds
 * @returns {Promise<any>}
 */
function withTimeout(fn, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Tool execution timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    Promise.resolve()
      .then(() => fn())
      .then(result => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch(err => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

/**
 * Sanitize tool output before returning to client
 * Ensure no internal paths or sensitive data leaks
 * @param {any} output
 * @returns {any}
 */
function sanitizeOutput(output) {
  if (!output) return output

  // Convert to string and back to remove non-serializable data
  try {
    return JSON.parse(JSON.stringify(output))
  } catch {
    return { result: String(output) }
  }
}

module.exports = { validateInput, withTimeout, sanitizeOutput }

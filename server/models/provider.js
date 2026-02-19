/**
 * Abstract model provider interface.
 * Implementations: anthropic.js, ollama.js
 */

/**
 * Get the active provider based on config
 */
function getProvider(providerName) {
  switch (providerName) {
    case 'anthropic':
      return require('./anthropic')
    case 'ollama':
      return require('./ollama')
    default:
      return require('./anthropic')
  }
}

module.exports = { getProvider }

const bcrypt = require('bcrypt')
const crypto = require('crypto')
const config = require('../config')

// Session store: token -> { userId, expiresAt }
// In-memory only — intentionally lost on server restart
const sessions = new Map()

const BCRYPT_ROUNDS = 12
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Set the initial passphrase (first-run only)
 * @param {string} plaintext
 */
async function setPassphrase(plaintext) {
  if (plaintext.length < 8) {
    throw new Error('Passphrase must be at least 8 characters')
  }
  const hash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS)
  config.set('passphraseHash', hash)
  config.set('firstRun', false)
}

/**
 * Check if passphrase has been set
 */
function hasPassphrase() {
  return !!config.get('passphraseHash')
}

/**
 * Verify passphrase and return session token
 * @param {string} plaintext
 * @returns {string} session token
 */
async function login(plaintext) {
  const hash = config.get('passphraseHash')
  if (!hash) throw new Error('No passphrase set. Run setup first.')

  const valid = await bcrypt.compare(plaintext, hash)
  if (!valid) throw new Error('Invalid passphrase')

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = Date.now() + SESSION_DURATION_MS
  sessions.set(token, { userId: 'local', expiresAt })

  return token
}

/**
 * Invalidate a session token
 * @param {string} token
 */
function logout(token) {
  sessions.delete(token)
}

/**
 * Validate a session token
 * @param {string} token
 * @returns {{ userId: string, expiresAt: number }}
 */
function validateSession(token) {
  const session = sessions.get(token)
  if (!session) throw new Error('Invalid session')
  if (Date.now() > session.expiresAt) {
    sessions.delete(token)
    throw new Error('Session expired')
  }
  return session
}

/**
 * Express middleware: require valid session token
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' })
  }
  const token = authHeader.replace('Bearer ', '')
  try {
    req.session = validateSession(token)
    next()
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
}

module.exports = { setPassphrase, hasPassphrase, login, logout, validateSession, requireAuth }

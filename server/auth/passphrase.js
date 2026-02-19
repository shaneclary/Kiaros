const bcrypt = require('bcrypt')
const crypto = require('crypto')
const config = require('../config')

// Session store: token -> { userId, expiresAt, encKey }
// In-memory only — intentionally lost on server restart.
// Re-login re-derives the credential encryption key from the passphrase.
const sessions = new Map()

const BCRYPT_ROUNDS = 12
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

// PBKDF2 parameters — used once at login, not per-credential
const KDF_ITERATIONS = 100000
const KDF_KEYLEN = 32
const KDF_DIGEST = 'sha256'

/**
 * Derive the 32-byte credential encryption key from the passphrase.
 * Uses a per-installation salt (stored in config, generated once at setup).
 * The derived key is NEVER written to disk — lives in session memory only.
 * @param {string} passphrase
 * @param {Buffer} salt  per-installation salt from config
 * @returns {Buffer} 32-byte AES-256-GCM key
 */
function deriveEncKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, KDF_ITERATIONS, KDF_KEYLEN, KDF_DIGEST)
}

/**
 * Set the initial passphrase (first-run only).
 * Also generates and stores the per-installation credential salt.
 * @param {string} plaintext
 */
async function setPassphrase(plaintext) {
  if (plaintext.length < 8) {
    throw new Error('Passphrase must be at least 8 characters')
  }
  const hash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS)
  config.set('passphraseHash', hash)

  // Generate a stable per-installation salt for credential encryption.
  // Combined with the passphrase via PBKDF2 → the in-memory session encKey.
  // If this salt is lost, credentials cannot be recovered (intentional).
  if (!config.get('credentialSalt')) {
    config.set('credentialSalt', crypto.randomBytes(32).toString('hex'))
  }

  config.set('firstRun', false)
}

/**
 * Check if passphrase has been set
 */
function hasPassphrase() {
  return !!config.get('passphraseHash')
}

/**
 * Verify passphrase, derive credential encryption key, return session token.
 * The encKey is stored in-memory only and is never written to disk.
 * @param {string} plaintext
 * @returns {string} session token
 */
async function login(plaintext) {
  const hash = config.get('passphraseHash')
  if (!hash) throw new Error('No passphrase set. Run setup first.')

  const valid = await bcrypt.compare(plaintext, hash)
  if (!valid) throw new Error('Invalid passphrase')

  const saltHex = config.get('credentialSalt')
  if (!saltHex) throw new Error('Installation salt missing. Please re-run setup.')

  // Derive credential encryption key. Stored in session Map — never on disk.
  // NEVER log this value.
  const encKey = deriveEncKey(plaintext, Buffer.from(saltHex, 'hex'))

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = Date.now() + SESSION_DURATION_MS
  sessions.set(token, { userId: 'local', expiresAt, encKey })

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
 * Express middleware: require valid session token.
 * Sets req.session and req.encKey (passphrase-derived AES key, in-memory only).
 * NEVER log req.encKey. NEVER send it to the client.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' })
  }
  const token = authHeader.replace('Bearer ', '')
  try {
    const session = validateSession(token)
    req.session = session
    req.encKey = session.encKey // Buffer — passphrase-derived, never leaves server memory
    next()
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
}

module.exports = { setPassphrase, hasPassphrase, login, logout, validateSession, requireAuth }

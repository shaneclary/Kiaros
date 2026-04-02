const bcrypt = require('bcrypt')
const crypto = require('crypto')
const config = require('../config')

// In-memory session store (intentionally ephemeral)
const sessions = new Map()

async function setPassphrase(plaintext) {
  const hash = await bcrypt.hash(plaintext, 12)
  config.set('passphraseHash', hash)
  config.set('firstRun', false)
}

async function login(plaintext) {
  const hash = config.get('passphraseHash')
  if (!hash) throw new Error('No passphrase set. Run setup first.')

  const valid = await bcrypt.compare(plaintext, hash)
  if (!valid) throw new Error('Invalid passphrase')

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000
  sessions.set(token, { userId: 'local', expiresAt })

  return token
}

function validateSession(token) {
  const session = sessions.get(token)
  if (!session) throw new Error('Invalid session')
  if (Date.now() > session.expiresAt) {
    sessions.delete(token)
    throw new Error('Session expired')
  }
  return session
}

function logout(token) {
  sessions.delete(token)
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  try {
    req.session = validateSession(token)
    next()
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
}

/** Return the raw passphrase during login for credential encryption */
function getPassphraseForSession() {
  // Passphrase is only available transiently — caller must supply it
  return null
}

module.exports = { setPassphrase, login, logout, validateSession, requireAuth }

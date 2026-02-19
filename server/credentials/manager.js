const crypto = require('crypto')
const { getDb } = require('../db/client')

// Derive a 256-bit key from passphrase using PBKDF2
function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256')
}

/**
 * Encrypt an API key with AES-256-GCM
 * Key is derived from user passphrase — never stored directly
 * @param {string} apiKey
 * @param {string} passphrase
 * @returns {string} JSON blob suitable for storage
 */
function encryptKey(apiKey, passphrase) {
  const salt = crypto.randomBytes(16)
  const key = deriveKey(passphrase, salt)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return JSON.stringify({
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex')
  })
}

/**
 * Decrypt an API key
 * @param {string} encryptedBlob - JSON string from storage
 * @param {string} passphrase
 * @returns {string} plaintext API key
 */
function decryptKey(encryptedBlob, passphrase) {
  const { salt, iv, tag, data } = JSON.parse(encryptedBlob)
  const key = deriveKey(passphrase, Buffer.from(salt, 'hex'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8')
}

/**
 * Mask API key for display: show only first 12 chars
 * @param {string} apiKey
 * @returns {string} masked key
 */
function maskKey(apiKey) {
  if (!apiKey || apiKey.length < 12) return '***'
  return apiKey.substring(0, 12) + '...'
}

/**
 * Add a new credential
 * @param {{ label: string, apiKey: string, model?: string, monthlyBudgetCents?: number }} opts
 * @param {string} passphrase - to encrypt the key
 * @returns {object} created credential (with masked key)
 */
function addCredential({ label, apiKey, model, monthlyBudgetCents }, passphrase) {
  const db = getDb()
  const id = crypto.randomUUID()
  const encrypted = encryptKey(apiKey, passphrase)

  db.prepare(`
    INSERT INTO credentials (id, label, key_encrypted, model, monthly_budget_cents)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    id,
    label,
    encrypted,
    model || 'claude-sonnet-4-20250514',
    monthlyBudgetCents || 0
  )

  return getCredential(id)
}

/**
 * Get single credential (masked)
 */
function getCredential(id) {
  const db = getDb()
  const cred = db.prepare('SELECT * FROM credentials WHERE id = ?').get(id)
  if (!cred) return null
  return {
    id: cred.id,
    label: cred.label,
    keyMasked: maskKey(decryptKeyById(id, null) || 'sk-ant-api'),
    model: cred.model,
    monthlyBudgetCents: cred.monthly_budget_cents,
    currentSpendCents: cred.current_spend_cents,
    isActive: !!cred.is_active,
    createdAt: cred.created_at
  }
}

/**
 * List all credentials (masked keys)
 */
function listCredentials() {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM credentials ORDER BY created_at DESC').all()
  return rows.map(cred => ({
    id: cred.id,
    label: cred.label,
    keyMasked: 'sk-ant-api...',
    model: cred.model,
    monthlyBudgetCents: cred.monthly_budget_cents,
    currentSpendCents: cred.current_spend_cents,
    isActive: !!cred.is_active,
    createdAt: cred.created_at
  }))
}

/**
 * Decrypt a credential's API key for internal use only
 * NEVER expose this value to clients
 * @param {string} id - credential id
 * @param {string} passphrase
 * @returns {string} plaintext API key
 */
function getDecryptedKey(id, passphrase) {
  const db = getDb()
  const cred = db.prepare('SELECT key_encrypted FROM credentials WHERE id = ? AND is_active = 1').get(id)
  if (!cred) throw new Error('Credential not found or disabled')
  return decryptKey(cred.key_encrypted, passphrase)
}

// Internal: try to decrypt without passphrase for masking display (will fail, that's ok)
function decryptKeyById(id, passphrase) {
  try {
    if (!passphrase) return null
    return getDecryptedKey(id, passphrase)
  } catch {
    return null
  }
}

/**
 * Delete a credential
 */
function deleteCredential(id) {
  const db = getDb()
  db.prepare('DELETE FROM credentials WHERE id = ?').run(id)
}

/**
 * Update credential settings (model, budget)
 */
function updateCredential(id, { label, model, monthlyBudgetCents }) {
  const db = getDb()
  const updates = []
  const params = []

  if (label !== undefined) { updates.push('label = ?'); params.push(label) }
  if (model !== undefined) { updates.push('model = ?'); params.push(model) }
  if (monthlyBudgetCents !== undefined) { updates.push('monthly_budget_cents = ?'); params.push(monthlyBudgetCents) }

  if (updates.length === 0) return

  params.push(id)
  db.prepare(`UPDATE credentials SET ${updates.join(', ')} WHERE id = ?`).run(...params)
}

/**
 * Add to spend counter
 */
function recordSpend(id, millicents) {
  const db = getDb()
  db.prepare('UPDATE credentials SET current_spend_cents = current_spend_cents + ? WHERE id = ?').run(
    Math.ceil(millicents / 1000),
    id
  )
}

/**
 * Get the first active credential id (single-user convenience)
 */
function getActiveCredentialId() {
  const db = getDb()
  const cred = db.prepare('SELECT id FROM credentials WHERE is_active = 1 LIMIT 1').get()
  return cred?.id || null
}

/**
 * Get raw encrypted blob for a credential
 */
function getEncryptedBlob(id) {
  const db = getDb()
  const cred = db.prepare('SELECT key_encrypted FROM credentials WHERE id = ?').get(id)
  return cred?.key_encrypted || null
}

module.exports = {
  encryptKey,
  decryptKey,
  maskKey,
  addCredential,
  getCredential,
  listCredentials,
  getDecryptedKey,
  deleteCredential,
  updateCredential,
  recordSpend,
  getActiveCredentialId,
  getEncryptedBlob
}

const crypto = require('crypto')
const { getDb } = require('../db/client')

/**
 * Encrypt an API key with AES-256-GCM.
 *
 * The encryption key (encKey) is the passphrase-derived Buffer stored in the
 * user's session (derived via PBKDF2 at login time — see auth/passphrase.js).
 * We use a fresh random 12-byte IV per credential; no per-credential KDF needed
 * since the session key is already properly derived.
 *
 * @param {string} apiKey      - plaintext Anthropic API key
 * @param {Buffer} encKey      - 32-byte session encryption key (NEVER log)
 * @returns {string} JSON blob suitable for storage in SQLite
 */
function encryptKey(apiKey, encKey) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv)
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return JSON.stringify({
    v: 2,  // schema version — v1 used per-credential PBKDF2 (retired)
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex')
  })
}

/**
 * Decrypt an API key.
 *
 * @param {string} encryptedBlob - JSON blob from storage
 * @param {Buffer} encKey        - 32-byte session encryption key (NEVER log)
 * @returns {string} plaintext API key
 */
function decryptKey(encryptedBlob, encKey) {
  const blob = JSON.parse(encryptedBlob)

  if (blob.v !== 2) {
    throw new Error(
      'Credential was encrypted with an older format. ' +
      'Please delete and re-add this API key.'
    )
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encKey,
    Buffer.from(blob.iv, 'hex')
  )
  decipher.setAuthTag(Buffer.from(blob.tag, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(blob.data, 'hex')),
    decipher.final()
  ]).toString('utf8')
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
 * @param {Buffer} encKey - 32-byte session encryption key from req.encKey (NEVER log)
 * @returns {object} created credential (with masked key)
 */
function addCredential({ label, apiKey, model, monthlyBudgetCents }, encKey) {
  const db = getDb()
  const id = crypto.randomUUID()
  const encrypted = encryptKey(apiKey, encKey)

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
 * Get single credential (masked key — never decrypts)
 */
function getCredential(id) {
  const db = getDb()
  const cred = db.prepare('SELECT * FROM credentials WHERE id = ?').get(id)
  if (!cred) return null
  return {
    id: cred.id,
    label: cred.label,
    keyMasked: 'sk-ant-api...',
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
 * Decrypt a credential's API key for internal use ONLY.
 * NEVER expose the returned value to clients or logs.
 * @param {string} id     - credential id
 * @param {Buffer} encKey - 32-byte session encryption key from req.encKey
 * @returns {string} plaintext API key
 */
function getDecryptedKey(id, encKey) {
  const db = getDb()
  const cred = db.prepare('SELECT key_encrypted FROM credentials WHERE id = ? AND is_active = 1').get(id)
  if (!cred) throw new Error('Credential not found or disabled')
  return decryptKey(cred.key_encrypted, encKey)
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
}

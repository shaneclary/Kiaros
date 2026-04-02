const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db/client')

function encryptKey(apiKey, passphrase) {
  const salt = crypto.randomBytes(16)
  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256')
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

function decryptKey(encryptedBlob, passphrase) {
  const { salt, iv, tag, data } = JSON.parse(encryptedBlob)
  const key = crypto.pbkdf2Sync(passphrase, Buffer.from(salt, 'hex'), 100000, 32, 'sha256')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8')
}

function maskKey(encryptedBlob, passphrase) {
  try {
    const key = decryptKey(encryptedBlob, passphrase)
    return key.substring(0, 12) + '...'
  } catch {
    return 'sk-ant-...'
  }
}

function addCredential(label, apiKey, passphrase, model) {
  const db = getDb()
  const id = uuidv4()
  const encrypted = encryptKey(apiKey, passphrase)

  db.prepare(`
    INSERT INTO credentials (id, label, key_encrypted, model)
    VALUES (?, ?, ?, ?)
  `).run(id, label, encrypted, model || 'claude-sonnet-4-20250514')

  return id
}

function listCredentials() {
  const db = getDb()
  return db.prepare(`
    SELECT id, label, model, monthly_budget_cents, current_spend_cents, is_active, created_at
    FROM credentials ORDER BY created_at DESC
  `).all()
}

function getActiveCredential(passphrase) {
  const db = getDb()
  const cred = db.prepare('SELECT * FROM credentials WHERE is_active = 1 LIMIT 1').get()
  if (!cred) return null
  return {
    ...cred,
    apiKey: decryptKey(cred.key_encrypted, passphrase)
  }
}

function getCredentialById(id, passphrase) {
  const db = getDb()
  const cred = db.prepare('SELECT * FROM credentials WHERE id = ?').get(id)
  if (!cred) return null
  return {
    ...cred,
    apiKey: decryptKey(cred.key_encrypted, passphrase)
  }
}

function deleteCredential(id) {
  const db = getDb()
  db.prepare('DELETE FROM credentials WHERE id = ?').run(id)
}

function updateCredential(id, updates) {
  const db = getDb()
  const fields = []
  const values = []

  if (updates.model) { fields.push('model = ?'); values.push(updates.model) }
  if (updates.monthly_budget_cents !== undefined) { fields.push('monthly_budget_cents = ?'); values.push(updates.monthly_budget_cents) }
  if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active ? 1 : 0) }

  if (fields.length === 0) return
  values.push(id)
  db.prepare(`UPDATE credentials SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

function trackSpend(id, millicents) {
  const db = getDb()
  db.prepare('UPDATE credentials SET current_spend_cents = current_spend_cents + ? WHERE id = ?').run(millicents, id)
}

module.exports = {
  encryptKey, decryptKey, maskKey,
  addCredential, listCredentials, getActiveCredential, getCredentialById,
  deleteCredential, updateCredential, trackSpend
}

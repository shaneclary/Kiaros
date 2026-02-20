/**
 * Kiaros Proactive Task Scheduler (Phase 12)
 *
 * Manages scheduled jobs — recurring prompts that Claude runs automatically
 * on a cron schedule, archives results, and delivers desktop notifications.
 *
 * Security model
 * ══════════════
 * Scheduled jobs require an Anthropic API key, which is encrypted at rest.
 * The decryption key (encKey) only exists in RAM during an active user session.
 * On login, routes/auth.js calls scheduler.unlockWithEncKey(encKey).
 * On logout (or server restart), the key is cleared and jobs pause until
 * the user logs in again.
 *
 * This matches the existing security model: no decryption without the
 * passphrase, no decryption without a live session.
 *
 * Tick interval: every 60 seconds.
 * Jobs fire when next_run_at ≤ now AND enabled = 1 AND scheduler is unlocked.
 */

const crypto = require('crypto')
const { getDb } = require('../db/client')
const { nextRunAfter, validate } = require('./cron')
const { runJob } = require('./runner')

// ── Idempotent schema migration ────────────────────────────────────────────
// SQLite ALTER TABLE ADD COLUMN does not support UNIQUE — add column then index separately.
try { getDb().exec('ALTER TABLE scheduled_jobs ADD COLUMN webhook_token TEXT') } catch {}
try {
  getDb().exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_sched_webhook ON scheduled_jobs(webhook_token) ' +
    'WHERE webhook_token IS NOT NULL'
  )
} catch {}

// ── In-memory scheduler key (NEVER log) ──────────────────────────────────
let schedulerEncKey = null   // Buffer | null
let tickInterval    = null

// ── DB helpers ─────────────────────────────────────────────────────────────

function rowToJob(r) {
  return {
    id:                r.id,
    name:              r.name,
    prompt:            r.prompt,
    schedule:          r.schedule,
    credentialId:      r.credential_id || null,
    model:             r.model || null,
    enabled:           !!r.enabled,
    lastRunAt:         r.last_run_at || null,
    nextRunAt:         r.next_run_at || null,
    lastResultSummary: r.last_result_summary || null,
    lastError:         r.last_error || null,
    hasWebhook:        !!r.webhook_token,
    createdAt:         r.created_at,
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────

/**
 * List all scheduled jobs.
 * @returns {object[]}
 */
function listJobs() {
  return getDb().prepare('SELECT * FROM scheduled_jobs ORDER BY created_at ASC').all().map(rowToJob)
}

/**
 * Get a single job by id.
 * @param {string} id
 * @returns {object|null}
 */
function getJob(id) {
  const row = getDb().prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(id)
  return row ? rowToJob(row) : null
}

/**
 * Create a new scheduled job.
 *
 * @param {{ name, prompt, schedule, credentialId?, model?, enabled? }} opts
 * @returns {object} created job
 */
function createJob({ name, prompt, schedule, credentialId, model, enabled = true }) {
  if (!name || !prompt || !schedule) throw new Error('name, prompt, and schedule are required')

  const err = validate(schedule)
  if (err) throw new Error(`Invalid schedule: ${err}`)

  const id      = crypto.randomUUID()
  const nextRun = nextRunAfter(schedule)

  getDb().prepare(`
    INSERT INTO scheduled_jobs (id, name, prompt, schedule, credential_id, model, enabled, next_run_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, name, prompt, schedule,
    credentialId || null,
    model || null,
    enabled ? 1 : 0,
    nextRun ? nextRun.toISOString() : null
  )

  return getJob(id)
}

/**
 * Update a job's fields.
 * Recomputes next_run_at if schedule changes.
 *
 * @param {string} id
 * @param {{ name?, prompt?, schedule?, credentialId?, model?, enabled? }} updates
 * @returns {object} updated job
 */
function updateJob(id, updates) {
  const existing = getJob(id)
  if (!existing) throw new Error('Job not found')

  const cols  = []
  const params = []

  if (updates.name !== undefined)         { cols.push('name = ?');          params.push(updates.name) }
  if (updates.prompt !== undefined)       { cols.push('prompt = ?');        params.push(updates.prompt) }
  if (updates.credentialId !== undefined) { cols.push('credential_id = ?'); params.push(updates.credentialId) }
  if (updates.model !== undefined)        { cols.push('model = ?');         params.push(updates.model) }
  if (updates.enabled !== undefined)      { cols.push('enabled = ?');       params.push(updates.enabled ? 1 : 0) }

  if (updates.schedule !== undefined) {
    const err = validate(updates.schedule)
    if (err) throw new Error(`Invalid schedule: ${err}`)
    cols.push('schedule = ?')
    params.push(updates.schedule)
    // Recompute next_run_at
    const nextRun = nextRunAfter(updates.schedule)
    cols.push('next_run_at = ?')
    params.push(nextRun ? nextRun.toISOString() : null)
  }

  if (cols.length === 0) return existing
  params.push(id)
  getDb().prepare(`UPDATE scheduled_jobs SET ${cols.join(', ')} WHERE id = ?`).run(...params)

  return getJob(id)
}

/**
 * Delete a job.
 * @param {string} id
 */
function deleteJob(id) {
  getDb().prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(id)
}

// ── Execution ─────────────────────────────────────────────────────────────

/**
 * Execute a single job immediately (manual trigger or scheduler tick).
 * No-op if scheduler is locked and `requireUnlocked` is true (default for tick).
 *
 * @param {string} id
 * @param {boolean} [requireUnlocked=true]
 * @returns {Promise<{ summary, inputTokens, outputTokens }>}
 */
async function executeJob(id, requireUnlocked = true) {
  if (requireUnlocked && !schedulerEncKey) {
    throw new Error('Scheduler is locked. Log in to Kiaros to unlock scheduled jobs.')
  }

  const job = getJob(id)
  if (!job) throw new Error('Job not found')

  const db = getDb()

  // Mark as running (clear last error)
  db.prepare('UPDATE scheduled_jobs SET last_error = NULL WHERE id = ?').run(id)

  let result
  try {
    result = await runJob(job, schedulerEncKey)
  } catch (err) {
    // Persist error, advance next_run_at so we don't hammer on broken jobs
    const nextRun = nextRunAfter(job.schedule)
    db.prepare(`
      UPDATE scheduled_jobs
      SET last_run_at = datetime('now'),
          last_error = ?,
          next_run_at = ?
      WHERE id = ?
    `).run(err.message.substring(0, 500), nextRun ? nextRun.toISOString() : null, id)
    throw err
  }

  // Success — update timestamps and summary
  const nextRun = nextRunAfter(job.schedule)
  db.prepare(`
    UPDATE scheduled_jobs
    SET last_run_at = datetime('now'),
        last_result_summary = ?,
        last_error = NULL,
        next_run_at = ?
    WHERE id = ?
  `).run(
    (result.summary || '').substring(0, 500),
    nextRun ? nextRun.toISOString() : null,
    id
  )

  return result
}

// ── Webhook token management ───────────────────────────────────────────────

/**
 * Generate (or regenerate) a webhook token for a job.
 * The token is a 64-char hex string (32 random bytes).
 * Returns the plaintext token — store it; it is NOT stored in plaintext elsewhere.
 * (DB stores it directly; the token IS the secret, treat like a password.)
 *
 * @param {string} jobId
 * @returns {string} webhook token
 */
function generateWebhookToken(jobId) {
  const job = getJob(jobId)
  if (!job) throw new Error('Job not found')
  const token = crypto.randomBytes(32).toString('hex')
  getDb().prepare('UPDATE scheduled_jobs SET webhook_token = ? WHERE id = ?').run(token, jobId)
  return token
}

/**
 * Revoke a job's webhook token.
 * @param {string} jobId
 */
function revokeWebhookToken(jobId) {
  getDb().prepare('UPDATE scheduled_jobs SET webhook_token = NULL WHERE id = ?').run(jobId)
}

/**
 * Look up a job by its webhook token using timing-safe comparison.
 * Returns the job row or null if not found / token mismatch.
 * @param {string} token  — 64-char hex from the request URL
 * @returns {object|null}
 */
function getJobByWebhookToken(token) {
  // Basic format check before hitting the DB
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null

  const row = getDb().prepare(
    'SELECT * FROM scheduled_jobs WHERE webhook_token IS NOT NULL AND enabled = 1'
  ).all().find(r => {
    try {
      return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(r.webhook_token))
    } catch {
      return false
    }
  })

  return row ? rowToJob(row) : null
}

// ── Scheduler lifecycle ───────────────────────────────────────────────────

/**
 * Check for and run any due jobs.
 * Called every 60 seconds by the interval.
 */
async function tick() {
  if (!schedulerEncKey) return  // No key — skip silently

  const now = new Date().toISOString()
  const due = getDb().prepare(`
    SELECT id FROM scheduled_jobs
    WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
  `).all(now)

  for (const { id } of due) {
    executeJob(id).catch(err => {
      console.error(`[scheduler] Job ${id} failed: ${err.message}`)
    })
  }
}

/**
 * Start the 60-second scheduler tick.
 * Safe to call multiple times — only one interval is created.
 */
function start() {
  if (tickInterval) return
  tickInterval = setInterval(() => { tick().catch(() => {}) }, 60_000)
  // Run once at startup after a short delay (avoids hammering at boot)
  setTimeout(() => { tick().catch(() => {}) }, 5000)
  console.log('[scheduler] Tick started (every 60s)')
}

/**
 * Stop the scheduler tick (e.g. for graceful shutdown).
 */
function stop() {
  if (tickInterval) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}

// ── Key management ────────────────────────────────────────────────────────

/**
 * Provide the scheduler with the session encryption key so it can decrypt
 * API keys when running jobs. Called by routes/auth.js after login.
 * NEVER log the encKey.
 *
 * @param {Buffer} encKey - 32-byte passphrase-derived AES key
 */
function unlockWithEncKey(encKey) {
  schedulerEncKey = encKey
  console.log('[scheduler] Unlocked — scheduled jobs will run')
}

/**
 * Remove the in-memory encryption key.
 * Called on logout or session expiry. Jobs will pause until next login.
 */
function lock() {
  schedulerEncKey = null
  console.log('[scheduler] Locked — scheduled jobs paused until next login')
}

/**
 * Whether the scheduler currently has a key and can execute jobs.
 */
function isUnlocked() {
  return schedulerEncKey !== null
}

module.exports = {
  listJobs,
  getJob,
  createJob,
  updateJob,
  deleteJob,
  executeJob,
  generateWebhookToken,
  revokeWebhookToken,
  getJobByWebhookToken,
  start,
  stop,
  unlockWithEncKey,
  lock,
  isUnlocked,
}

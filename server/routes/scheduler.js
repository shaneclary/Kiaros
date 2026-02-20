/**
 * Scheduler REST API (Phase 12)
 *
 * GET    /api/scheduler/status           — locked/unlocked + job count
 * GET    /api/scheduler/jobs             — list all jobs
 * POST   /api/scheduler/jobs             — create job
 * GET    /api/scheduler/jobs/:id         — get single job
 * PUT    /api/scheduler/jobs/:id         — update job
 * DELETE /api/scheduler/jobs/:id         — delete job
 * POST   /api/scheduler/jobs/:id/run     — run job immediately (manual trigger)
 */

const express = require('express')
const router = express.Router()
const { requireAuth } = require('../auth/passphrase')
const {
  listJobs, getJob, createJob, updateJob, deleteJob, executeJob, isUnlocked
} = require('../scheduler/manager')
const { SHORTHANDS } = require('../scheduler/cron')

router.use(requireAuth)

// GET /api/scheduler/status
router.get('/status', (req, res) => {
  const jobs = listJobs()
  res.json({
    unlocked:    isUnlocked(),
    totalJobs:   jobs.length,
    enabledJobs: jobs.filter(j => j.enabled).length,
    shorthands:  SHORTHANDS,
  })
})

// GET /api/scheduler/jobs
router.get('/jobs', (req, res) => {
  try {
    res.json(listJobs())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/scheduler/jobs
router.post('/jobs', (req, res) => {
  try {
    const { name, prompt, schedule, credentialId, model, enabled } = req.body
    if (!name || !prompt || !schedule) {
      return res.status(400).json({ error: 'name, prompt, and schedule are required' })
    }
    if (typeof prompt !== 'string' || prompt.length > 4000) {
      return res.status(400).json({ error: 'prompt must be a string under 4000 chars' })
    }
    const job = createJob({ name, prompt, schedule, credentialId, model, enabled })
    res.status(201).json(job)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/scheduler/jobs/:id
router.get('/jobs/:id', (req, res) => {
  try {
    const job = getJob(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    res.json(job)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/scheduler/jobs/:id
router.put('/jobs/:id', (req, res) => {
  try {
    const { name, prompt, schedule, credentialId, model, enabled } = req.body
    const job = updateJob(req.params.id, { name, prompt, schedule, credentialId, model, enabled })
    res.json(job)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/scheduler/jobs/:id
router.delete('/jobs/:id', (req, res) => {
  try {
    const job = getJob(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    deleteJob(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/scheduler/jobs/:id/run — manual trigger
router.post('/jobs/:id/run', async (req, res) => {
  try {
    if (!isUnlocked()) {
      return res.status(403).json({
        error: 'Scheduler is locked. Log out and log back in to unlock it.'
      })
    }
    const result = await executeJob(req.params.id, true)
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

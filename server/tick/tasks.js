/**
 * Task Continuation System — Kairos-inspired multi-step task tracking
 *
 * Tasks persist across sessions and can be resumed by the tick engine
 * or manually by the user. Each task has ordered steps that track progress.
 */

const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db/client')

function create(title, description, steps = [], sessionId = null, priority = 0) {
  const db = getDb()
  const id = uuidv4()

  const stepObjects = steps.map((s, i) => ({
    index: i,
    description: typeof s === 'string' ? s : s.description,
    status: 'pending',
    result: null
  }))

  db.prepare(`
    INSERT INTO tasks (id, session_id, title, description, steps, priority)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, title, description, JSON.stringify(stepObjects), priority)

  return id
}

function get(id) {
  const db = getDb()
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  if (task) task.steps = JSON.parse(task.steps || '[]')
  return task
}

function getByStatus(status) {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY priority DESC, created_at ASC').all(status)
  return rows.map(r => ({ ...r, steps: JSON.parse(r.steps || '[]') }))
}

function listAll(limit = 50) {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM tasks ORDER BY updated_at DESC LIMIT ?').all(limit)
  return rows.map(r => ({ ...r, steps: JSON.parse(r.steps || '[]') }))
}

function updateStatus(id, status) {
  const db = getDb()
  db.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id)
}

function advanceStep(id, stepResult) {
  const db = getDb()
  const task = get(id)
  if (!task) throw new Error('Task not found')

  const steps = task.steps
  const currentStep = task.current_step

  if (currentStep >= steps.length) {
    updateStatus(id, 'completed')
    return { completed: true }
  }

  steps[currentStep].status = 'completed'
  steps[currentStep].result = stepResult

  const nextStep = currentStep + 1
  const allDone = nextStep >= steps.length

  db.prepare(`
    UPDATE tasks SET steps = ?, current_step = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    JSON.stringify(steps),
    nextStep,
    allDone ? 'completed' : 'in_progress',
    id
  )

  return {
    completed: allDone,
    nextStep: allDone ? null : steps[nextStep],
    progress: `${nextStep}/${steps.length}`
  }
}

function pause(id, reason) {
  const db = getDb()
  const task = get(id)
  if (!task) throw new Error('Task not found')

  const steps = task.steps
  if (task.current_step < steps.length) {
    steps[task.current_step].status = 'paused'
    steps[task.current_step].pauseReason = reason
  }

  db.prepare("UPDATE tasks SET steps = ?, status = 'paused', updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(steps), id)
}

function resume(id) {
  const db = getDb()
  const task = get(id)
  if (!task) throw new Error('Task not found')

  if (task.status !== 'paused') throw new Error('Task is not paused')

  const steps = task.steps
  if (task.current_step < steps.length) {
    steps[task.current_step].status = 'in_progress'
  }

  db.prepare("UPDATE tasks SET steps = ?, status = 'in_progress', updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(steps), id)
}

function remove(id) {
  const db = getDb()
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

module.exports = { create, get, getByStatus, listAll, updateStatus, advanceStep, pause, resume, remove }

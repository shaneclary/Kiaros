/**
 * Kiaros Tick Engine — Inspired by Kairos proactive agent model
 *
 * This is the core innovation: a periodic evaluation loop that shifts
 * the system from purely reactive to proactively aware.
 *
 * The tick engine:
 * 1. Runs on a configurable interval
 * 2. Observes current state (tasks, memory, environment)
 * 3. Decides whether to act, skip, or defer
 * 4. Executes within user-approved constraints
 * 5. Logs all decisions for transparency
 *
 * Safety: The tick engine respects the same interrupt gate and scope
 * permissions as user-initiated actions. It can never exceed the
 * user's approved autonomy level.
 */

const crypto = require('crypto')
const config = require('../config')
const { getDb } = require('../db/client')
const tasks = require('./tasks')
const working = require('../memory/working')

let tickInterval = null
let tickNumber = 0
let lastActivity = Date.now()
let listeners = []

function onTick(callback) {
  listeners.push(callback)
  return () => { listeners = listeners.filter(l => l !== callback) }
}

function notifyListeners(event) {
  listeners.forEach(cb => {
    try { cb(event) } catch { /* ignore listener errors */ }
  })
}

function recordActivity() {
  lastActivity = Date.now()
}

function getIdleTime() {
  return Date.now() - lastActivity
}

/**
 * Core evaluation function — runs each tick
 * Returns: { decision: 'act' | 'skip' | 'defer', reason: string, action?: object }
 */
function evaluate() {
  const tickConfig = config.get('tick') || {}
  const idleThreshold = tickConfig.idleThresholdMs || 300000

  // Gather current state
  const state = {
    pendingTasks: tasks.getByStatus('pending'),
    inProgressTasks: tasks.getByStatus('in_progress'),
    pausedTasks: tasks.getByStatus('paused'),
    idleMs: getIdleTime(),
    memoryCount: working.getAll().length,
    tickNumber: tickNumber
  }

  // Decision logic

  // 1. Resume in-progress tasks
  if (state.inProgressTasks.length > 0) {
    const task = state.inProgressTasks[0]
    return {
      decision: 'act',
      reason: `Resuming in-progress task: ${task.title}`,
      action: { type: 'resume_task', taskId: task.id }
    }
  }

  // 2. Pick up pending tasks if idle
  if (state.idleMs > idleThreshold && state.pendingTasks.length > 0) {
    const task = state.pendingTasks.sort((a, b) => b.priority - a.priority)[0]
    return {
      decision: 'act',
      reason: `Starting pending task after ${Math.round(state.idleMs / 1000)}s idle: ${task.title}`,
      action: { type: 'start_task', taskId: task.id }
    }
  }

  // 3. Background memory consolidation if very idle
  if (state.idleMs > idleThreshold * 2 && state.memoryCount > 10) {
    return {
      decision: 'act',
      reason: 'Background memory consolidation (extended idle)',
      action: { type: 'consolidate_memory' }
    }
  }

  // 4. Check paused tasks that might be resumable
  if (state.pausedTasks.length > 0) {
    return {
      decision: 'defer',
      reason: `${state.pausedTasks.length} paused task(s) awaiting user input`
    }
  }

  return {
    decision: 'skip',
    reason: 'No actionable items'
  }
}

/**
 * Execute a single tick cycle
 */
async function tick() {
  tickNumber++
  const start = Date.now()

  const evaluation = evaluate()

  // Log the tick
  const db = getDb()
  db.prepare(`
    INSERT INTO tick_log (id, tick_number, context_summary, decision, action_taken, duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    crypto.randomUUID(),
    tickNumber,
    evaluation.reason,
    evaluation.decision,
    evaluation.action ? JSON.stringify(evaluation.action) : null,
    Date.now() - start
  )

  // Notify listeners
  notifyListeners({
    tickNumber,
    ...evaluation,
    timestamp: Date.now()
  })

  // If acting, the caller (orchestrator) handles execution
  return evaluation
}

function start() {
  const tickConfig = config.get('tick') || {}
  if (!tickConfig.enabled) return false

  const intervalMs = tickConfig.intervalMs || 60000

  if (tickInterval) stop()

  tickInterval = setInterval(async () => {
    try {
      await tick()
    } catch (err) {
      console.error('[tick-engine] Error:', err.message)
    }
  }, intervalMs)

  console.log(`[tick-engine] Started (interval: ${intervalMs}ms)`)
  return true
}

function stop() {
  if (tickInterval) {
    clearInterval(tickInterval)
    tickInterval = null
    console.log('[tick-engine] Stopped')
  }
}

function isRunning() {
  return tickInterval !== null
}

function getStatus() {
  const tickConfig = config.get('tick') || {}
  return {
    running: isRunning(),
    enabled: tickConfig.enabled || false,
    intervalMs: tickConfig.intervalMs || 60000,
    tickNumber,
    idleMs: getIdleTime(),
    maxAutonomousRisk: tickConfig.maxAutonomousRisk || 'low'
  }
}

function getRecentTicks(limit = 20) {
  const db = getDb()
  return db.prepare('SELECT * FROM tick_log ORDER BY created_at DESC LIMIT ?').all(limit)
}

module.exports = {
  start, stop, tick, isRunning, getStatus,
  evaluate, recordActivity, getIdleTime,
  onTick, getRecentTicks
}

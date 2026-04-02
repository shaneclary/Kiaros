const config = require('../config')
const { getRiskLevel } = require('../tools/scopes')

// Pending interrupts waiting for user approval
const pendingInterrupts = new Map()

function shouldInterrupt(action) {
  const mode = config.get('interruptMode') || 'confirm'

  if (mode === 'auto') return false
  if (mode === 'confirm') return true

  if (mode === 'smart') {
    const riskLevel = action.riskLevel || getRiskLevel(action.scopes || [])
    return riskLevel === 'high' || riskLevel === 'medium'
  }

  return true
}

function createInterrupt(action) {
  const id = require('crypto').randomUUID()
  const interrupt = {
    id,
    action,
    status: 'pending',
    createdAt: Date.now(),
    resolvedAt: null,
    resolve: null
  }

  const promise = new Promise((resolve) => {
    interrupt.resolve = resolve

    // Auto-timeout after 60 seconds
    setTimeout(() => {
      if (interrupt.status === 'pending') {
        interrupt.status = 'timeout'
        interrupt.resolvedAt = Date.now()
        pendingInterrupts.delete(id)
        resolve({ approved: false, reason: 'timeout' })
      }
    }, 60000)
  })

  pendingInterrupts.set(id, interrupt)
  return { id, promise }
}

function resolveInterrupt(id, approved) {
  const interrupt = pendingInterrupts.get(id)
  if (!interrupt || interrupt.status !== 'pending') {
    throw new Error('Interrupt not found or already resolved')
  }

  interrupt.status = approved ? 'approved' : 'blocked'
  interrupt.resolvedAt = Date.now()
  pendingInterrupts.delete(id)

  interrupt.resolve({ approved, reason: approved ? 'user_approved' : 'user_blocked' })
  return interrupt
}

function getPendingInterrupts() {
  return Array.from(pendingInterrupts.values()).map(i => ({
    id: i.id,
    action: i.action,
    status: i.status,
    createdAt: i.createdAt
  }))
}

module.exports = { shouldInterrupt, createInterrupt, resolveInterrupt, getPendingInterrupts }

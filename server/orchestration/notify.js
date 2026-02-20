/**
 * Desktop notification helper (Linux-native, zero npm dependencies)
 *
 * Uses notify-send (libnotify) which is present on GNOME, KDE, and most
 * Linux desktops. Two feature levels are probed at startup:
 *
 *   Full   — notify-send ≥ 0.7.9: supports --action and --wait
 *            Returns the user's chosen action ID from stdout.
 *            Used to resolve interrupt-gate approvals without the browser.
 *
 *   Basic  — older notify-send or no --action support
 *            Fires a display-only notification. Browser remains primary gate.
 *
 *   None   — notify-send not on $PATH → silently a no-op.
 *            Web UI is the sole approval path. Nothing breaks.
 *
 * All calls are fire-and-forget from the caller's perspective — this module
 * returns a Promise but callers may ignore it. Failures never propagate.
 */

const { spawn, execFile } = require('child_process')

// ── Capability detection ──────────────────────────────────────────────────

let notifySendPath = null
let supportsActions = false  // --action / --wait support (libnotify ≥ 0.7.9)

;(async () => {
  notifySendPath = await which('notify-send')
  if (!notifySendPath) {
    console.log('[notify] notify-send not found — desktop notifications disabled')
    return
  }

  // Probe --action support: pass an invalid action to a dry-run notification.
  // libnotify ≥ 0.7.9 accepts the flag; older versions reject it.
  supportsActions = await probeActionSupport(notifySendPath)
  console.log(`[notify] notify-send ready (actions: ${supportsActions ? 'yes' : 'no'})`)
})()

function which(cmd) {
  return new Promise(resolve => {
    execFile('which', [cmd], (err, stdout) => resolve(err ? null : stdout.trim()))
  })
}

function probeActionSupport(bin) {
  return new Promise(resolve => {
    // Expire immediately (1ms), action support present, then check exit code.
    // With --action: exits 0 on supported versions. On unsupported, exits non-zero.
    const proc = spawn(bin, ['-t', '1', '--action', 'probe=Probe', 'Kiaros', 'probe'], {
      stdio: 'ignore'
    })
    proc.on('close', code => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Send a desktop notification.
 *
 * @param {{
 *   summary: string,
 *   body?: string,
 *   urgency?: 'low'|'normal'|'critical',
 *   actions?: Array<{ id: string, label: string }>,
 *   timeoutMs?: number
 * }} opts
 *
 * @returns {Promise<{ sent: boolean, actionId: string|null }>}
 *   actionId is the id of the action the user clicked, or null if none / not supported.
 */
async function sendNotification({ summary, body, urgency = 'normal', actions = [], timeoutMs = 30000 }) {
  if (!notifySendPath) return { sent: false, actionId: null }

  const args = [
    '-a', 'Kiaros',
    '-u', urgency,
    '-i', 'dialog-question',
  ]

  const wantActions = supportsActions && actions.length > 0
  if (wantActions) {
    args.push('--wait')
    for (const { id, label } of actions) {
      args.push('--action', `${id}=${label}`)
    }
  } else if (timeoutMs < 60000) {
    // Set display timeout in milliseconds for display-only notifications.
    args.push('-t', String(timeoutMs))
  }

  args.push(summary)
  if (body) args.push(body)

  return new Promise(resolve => {
    const proc = spawn(notifySendPath, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: timeoutMs + 2000
    })

    let stdout = ''
    proc.stdout.on('data', d => { stdout += d.toString() })

    proc.on('close', code => {
      const actionId = wantActions ? (stdout.trim() || null) : null
      resolve({ sent: code === 0, actionId })
    })

    proc.on('error', () => resolve({ sent: false, actionId: null }))
  })
}

/**
 * Convenience: send a tool-approval notification for the interrupt gate.
 * Returns the chosen action ('approve' | 'deny') or null if the user did not
 * interact (notification closed without clicking, or actions unsupported).
 *
 * @param {{ interruptId, toolName, input, riskLevel }} action
 * @returns {Promise<'approve'|'deny'|null>}
 */
async function notifyToolApproval({ toolName, input, riskLevel }) {
  const urgency = riskLevel === 'high' ? 'critical' : 'normal'

  // Build a concise body from input keys (no values — they may be sensitive)
  const inputKeys = Object.keys(input || {}).slice(0, 3).join(', ')
  const body = inputKeys
    ? `Input fields: ${inputKeys}${riskLevel === 'high' ? '\n⚠ High-risk action' : ''}`
    : riskLevel === 'high' ? '⚠ High-risk action' : 'Review and approve in Kiaros'

  const result = await sendNotification({
    summary: `Kiaros: ${toolName}`,
    body,
    urgency,
    actions: [
      { id: 'approve', label: 'Approve' },
      { id: 'deny',    label: 'Deny'    },
    ],
    timeoutMs: 5 * 60 * 1000
  }).catch(() => ({ sent: false, actionId: null }))

  if (result.actionId === 'approve' || result.actionId === 'deny') {
    return result.actionId
  }
  return null  // User did not click — leave resolution to web UI
}

module.exports = { sendNotification, notifyToolApproval }

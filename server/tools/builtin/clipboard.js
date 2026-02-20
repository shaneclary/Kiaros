/**
 * Clipboard Tool — builtin tool
 *
 * Reads from and writes to the system clipboard.
 * Auto-detects display server:
 *   Wayland  ($WAYLAND_DISPLAY set) → wl-paste / wl-copy  (wl-clipboard package)
 *   X11      ($DISPLAY set)         → xclip / xsel
 *
 * If neither tool is found, a clear error with install instructions is returned.
 *
 * Two logical tools share this module:
 *   clipboard-read  (scope: fs:read)  — reads clipboard text
 *   clipboard-write (scope: fs:write) — overwrites clipboard text
 *
 * Input  (read):  { mime?: 'text/plain' }
 * Output (read):  { content: string, bytes: number, source: 'wayland'|'x11' }
 *
 * Input  (write): { content: string }
 * Output (write): { ok: true, bytes: number }
 */

const { exec, execFile } = require('child_process')

const TIMEOUT_MS = 8_000
const MAX_BYTES  = 512 * 1024  // 512 KB — sanity limit for clipboard content

// ── Display server detection ───────────────────────────────────────────────

function detectDisplayServer() {
  if (process.env.WAYLAND_DISPLAY) return 'wayland'
  if (process.env.DISPLAY)         return 'x11'
  return null
}

/**
 * Probe whether a binary is available on $PATH.
 * Returns the resolved path or null.
 * @param {string} cmd
 * @returns {Promise<string|null>}
 */
function which(cmd) {
  return new Promise(resolve => {
    execFile('which', [cmd], (err, stdout) => resolve(err ? null : stdout.trim()))
  })
}

// ── Read ───────────────────────────────────────────────────────────────────

async function clipboardRead(input) {
  const server = detectDisplayServer()
  if (!server) {
    throw new Error(
      'No display server detected ($WAYLAND_DISPLAY and $DISPLAY are both unset). ' +
      'Clipboard access requires a running desktop session.'
    )
  }

  let cmd, args, installHint

  if (server === 'wayland') {
    if (await which('wl-paste')) {
      cmd  = 'wl-paste'
      args = ['--no-newline']
    } else {
      throw new Error('wl-paste not found. Install wl-clipboard: sudo apt install wl-clipboard')
    }
    installHint = 'sudo apt install wl-clipboard'
  } else {
    if (await which('xclip')) {
      cmd  = 'xclip'
      args = ['-selection', 'clipboard', '-o']
      installHint = 'sudo apt install xclip'
    } else if (await which('xsel')) {
      cmd  = 'xsel'
      args = ['--clipboard', '--output']
      installHint = 'sudo apt install xsel'
    } else {
      throw new Error('No X11 clipboard tool found. Install one: sudo apt install xclip')
    }
  }

  return new Promise((resolve, reject) => {
    const proc = execFile(cmd, args, { encoding: 'utf8', timeout: TIMEOUT_MS }, (err, stdout) => {
      if (err && err.code !== 0 && !stdout) {
        reject(new Error(`Clipboard read failed. Ensure a display session is active. Install hint: ${installHint}`))
        return
      }
      const content = stdout.substring(0, MAX_BYTES)
      resolve({
        content,
        bytes:    Buffer.byteLength(content, 'utf8'),
        source:   server,
        truncated: stdout.length > MAX_BYTES
      })
    })
    // Some tools hang if clipboard is empty — the timeout handles it
    void proc
  })
}

// ── Write ──────────────────────────────────────────────────────────────────

async function clipboardWrite(input) {
  const { content } = input
  if (typeof content !== 'string') throw new Error('content must be a string')
  if (content.length > MAX_BYTES)  throw new Error(`content too large (max ${MAX_BYTES / 1024} KB)`)

  const server = detectDisplayServer()
  if (!server) {
    throw new Error(
      'No display server detected. Clipboard access requires a running desktop session.'
    )
  }

  let cmd, args

  if (server === 'wayland') {
    if (await which('wl-copy')) {
      cmd  = 'wl-copy'
      args = []
    } else {
      throw new Error('wl-copy not found. Install wl-clipboard: sudo apt install wl-clipboard')
    }
  } else {
    if (await which('xclip')) {
      cmd  = 'xclip'
      args = ['-selection', 'clipboard']
    } else if (await which('xsel')) {
      cmd  = 'xsel'
      args = ['--clipboard', '--input']
    } else {
      throw new Error('No X11 clipboard tool found. Install one: sudo apt install xclip')
    }
  }

  return new Promise((resolve, reject) => {
    const proc = execFile(cmd, args, { encoding: 'utf8', timeout: TIMEOUT_MS }, (err) => {
      if (err) {
        reject(new Error(`Clipboard write failed: ${err.message}`))
        return
      }
      resolve({
        ok:    true,
        bytes: Buffer.byteLength(content, 'utf8'),
      })
    })
    proc.stdin.write(content, 'utf8')
    proc.stdin.end()
  })
}

module.exports = { clipboardRead, clipboardWrite }

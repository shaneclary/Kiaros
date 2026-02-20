/**
 * Shell Command Executor — builtin tool
 *
 * Runs an arbitrary shell command in the user's environment and returns
 * stdout, stderr, exit code, and timing.
 *
 * Security model
 * ══════════════
 *  - Scope: shell:exec — requires explicit user approval before any invocation.
 *  - Interrupt gate: executor.js fires for all shell:exec tools (high-risk scope),
 *    so the user is prompted before every run unless they set mode to 'auto'.
 *  - Audit log: every invocation (command, cwd, output, exit code) is recorded.
 *  - Hard limits: 30s timeout ceiling, 50 KB output cap.
 *  - The tool intentionally does NOT further restrict what commands are allowed.
 *    The scope approval + interrupt gate are the trust boundary. This matches
 *    how a terminal emulator works — the user controls what runs.
 *
 * Input:  { command: string, cwd?: string, timeout?: number }
 * Output: { stdout, stderr, exitCode, timedOut, truncated, durationMs }
 */

const { exec } = require('child_process')
const path = require('path')
const os   = require('os')

const MAX_OUTPUT_BYTES = 50 * 1024   // 50 KB per stream
const MAX_TIMEOUT_MS   = 30_000      // hard ceiling

async function shellExec(input) {
  const { command, cwd, timeout } = input

  if (!command || typeof command !== 'string') throw new Error('command is required')
  if (command.length > 4000) throw new Error('command too long (max 4000 chars)')

  const timeoutMs = Math.min(typeof timeout === 'number' ? timeout : 10_000, MAX_TIMEOUT_MS)
  const workDir   = cwd ? path.resolve(String(cwd)) : os.homedir()

  const startTime = Date.now()

  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd:       workDir,
        timeout:   timeoutMs,
        maxBuffer: MAX_OUTPUT_BYTES * 4,  // exec buffer; we truncate manually below
        encoding:  'utf8',
        env:       { ...process.env, TERM: 'dumb' }  // inherit env; disable ANSI in some tools
      },
      (error, rawStdout, rawStderr) => {
        const durationMs = Date.now() - startTime
        const stdout     = (rawStdout || '').substring(0, MAX_OUTPUT_BYTES)
        const stderr     = (rawStderr || '').substring(0, MAX_OUTPUT_BYTES)
        const truncated  = (rawStdout || '').length > MAX_OUTPUT_BYTES ||
                           (rawStderr || '').length > MAX_OUTPUT_BYTES
        const timedOut   = !!(error?.killed || error?.signal === 'SIGTERM')

        // exec's `error.code` is the exit code for process errors;
        // for timeout kills it may be null.
        let exitCode = 0
        if (error) {
          exitCode = typeof error.code === 'number' ? error.code : (timedOut ? 124 : 1)
        }

        resolve({ stdout, stderr, exitCode, timedOut, truncated, durationMs })
      }
    )
  })
}

module.exports = { shellExec }

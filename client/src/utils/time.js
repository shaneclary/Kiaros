/**
 * Relative and absolute time formatting utilities.
 */

/**
 * Returns a human-readable relative time string.
 * e.g. "just now", "3m ago", "2h ago", "yesterday", "Jan 5"
 * @param {string|null} isoString
 * @returns {string}
 */
export function relativeTime(isoString) {
  if (!isoString) return '—'
  const ms = Date.now() - new Date(isoString).getTime()
  if (ms < 0) return 'in the future'
  if (ms < 60_000)       return 'just now'
  if (ms < 3_600_000)    return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000)   return `${Math.floor(ms / 3_600_000)}h ago`
  if (ms < 172_800_000)  return 'yesterday'
  if (ms < 604_800_000)  return `${Math.floor(ms / 86_400_000)}d ago`
  return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Returns a human-readable future time string.
 * e.g. "in 3m", "in 2h", "in 5d"
 * @param {string|null} isoString
 * @returns {string}
 */
export function relativeTimeFuture(isoString) {
  if (!isoString) return '—'
  const ms = new Date(isoString).getTime() - Date.now()
  if (ms <= 0)           return 'now'
  if (ms < 3_600_000)    return `in ${Math.ceil(ms / 60_000)}m`
  if (ms < 86_400_000)   return `in ${Math.floor(ms / 3_600_000)}h`
  return `in ${Math.floor(ms / 86_400_000)}d`
}

/**
 * Returns a full locale datetime string.
 * @param {string|null} isoString
 * @returns {string}
 */
export function formatDateTime(isoString) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

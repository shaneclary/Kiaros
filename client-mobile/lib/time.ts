export function relativeTime(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  const ms = Date.now() - new Date(isoString).getTime()
  if (ms < 0)            return 'in the future'
  if (ms < 60_000)       return 'just now'
  if (ms < 3_600_000)    return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000)   return `${Math.floor(ms / 3_600_000)}h ago`
  if (ms < 172_800_000)  return 'yesterday'
  if (ms < 604_800_000)  return `${Math.floor(ms / 86_400_000)}d ago`
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: new Date(isoString).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  })
}

export function relativeTimeFuture(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  const ms = new Date(isoString).getTime() - Date.now()
  if (ms < 0)            return 'overdue'
  if (ms < 60_000)       return 'in <1m'
  if (ms < 3_600_000)    return `in ${Math.floor(ms / 60_000)}m`
  if (ms < 86_400_000)   return `in ${Math.floor(ms / 3_600_000)}h`
  return `in ${Math.floor(ms / 86_400_000)}d`
}

export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

import React, { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { relativeTime, relativeTimeFuture, formatDateTime } from '../utils/time'

const SHORTHANDS = ['@hourly', '@daily', '@morning', '@midnight', '@weekly', '@weekday', '@monthly']
const MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-20250514',
  'claude-haiku-4-20250514',
]
const EMPTY_FORM = {
  name: '', prompt: '', schedule: '@daily',
  credentialId: '', model: '', enabled: true,
}

// ── Risk badge colour by text ──────────────────────────────────────────────
function statusDot(job) {
  if (job.lastError) return 'bg-red-500'
  if (job.lastRunAt) return 'bg-green-500'
  return 'bg-gray-600'
}

// ── Copy-to-clipboard helper ───────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={copy}
      className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors shrink-0"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

// ── Single job row ─────────────────────────────────────────────────────────
function JobRow({ job, expanded, onToggleExpand, onEdit, onDelete, onToggle,
                  onRunNow, onGenerateWebhook, onRevokeWebhook,
                  running, toggling, webhookJustGenerated, onDismissWebhook }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(job)}`} title={job.lastError || (job.lastRunAt ? 'Last run OK' : 'Never run')} />

        {/* Name + schedule */}
        <button
          onClick={onToggleExpand}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white text-sm font-semibold truncate">{job.name}</span>
            <span className="px-2 py-0.5 bg-gray-800 text-blue-400 text-xs rounded font-mono shrink-0">
              {job.schedule}
            </span>
            {!job.enabled && (
              <span className="px-2 py-0.5 bg-gray-800 text-gray-500 text-xs rounded shrink-0">disabled</span>
            )}
            {job.hasWebhook && (
              <span className="px-2 py-0.5 bg-gray-800 text-purple-400 text-xs rounded shrink-0">webhook</span>
            )}
          </div>
          <div className="flex gap-4 mt-1 text-xs text-gray-500">
            <span>Last run: {relativeTime(job.lastRunAt)}</span>
            <span>Next: {job.enabled ? relativeTimeFuture(job.nextRunAt) : '—'}</span>
          </div>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Enable toggle */}
          <button
            onClick={onToggle}
            disabled={toggling}
            title={job.enabled ? 'Disable' : 'Enable'}
            className={`w-9 h-5 rounded-full transition-colors relative ${
              toggling ? 'opacity-50' : ''
            } ${job.enabled ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${
              job.enabled ? 'left-4' : 'left-0.5'
            }`} />
          </button>

          <button
            onClick={onRunNow}
            disabled={running}
            title="Run now"
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors disabled:opacity-50"
          >
            {running ? '⟳' : '▶'}
          </button>
          <button
            onClick={onEdit}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 text-xs rounded transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-800 px-4 py-3 space-y-3">
          {/* Last result */}
          {job.lastResultSummary && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Last result · {formatDateTime(job.lastRunAt)}</div>
              <div className="text-gray-300 text-sm whitespace-pre-wrap bg-gray-800 rounded p-3">
                {job.lastResultSummary}
              </div>
            </div>
          )}

          {/* Last error */}
          {job.lastError && (
            <div>
              <div className="text-xs text-red-500 mb-1">Last error</div>
              <div className="text-red-300 text-sm bg-red-950 rounded p-3 font-mono">
                {job.lastError}
              </div>
            </div>
          )}

          {/* Prompt preview */}
          <div>
            <div className="text-xs text-gray-500 mb-1">Prompt</div>
            <div className="text-gray-400 text-sm bg-gray-800 rounded p-3 whitespace-pre-wrap line-clamp-4">
              {job.prompt}
            </div>
          </div>

          {/* Webhook section */}
          <div className="border-t border-gray-800 pt-3">
            <div className="text-xs text-gray-500 mb-2">Webhook trigger</div>

            {/* Show newly generated token — only visible once */}
            {webhookJustGenerated ? (
              <div className="bg-yellow-950 border border-yellow-700 rounded p-3 space-y-2">
                <div className="text-yellow-300 text-xs font-semibold">
                  ⚠ Store this token now. It will not be shown again.
                </div>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 bg-gray-900 rounded px-2 py-1 text-xs text-green-400 font-mono break-all">
                    {webhookJustGenerated.token}
                  </code>
                  <CopyButton text={webhookJustGenerated.token} />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-gray-400">URL:</span>
                  <code className="flex-1 text-xs text-gray-300 font-mono break-all">
                    POST {window.location.origin}{webhookJustGenerated.url}
                  </code>
                  <CopyButton text={`${window.location.origin}${webhookJustGenerated.url}`} />
                </div>
                <button onClick={onDismissWebhook} className="text-xs text-yellow-600 hover:text-yellow-400">
                  I've saved the token — dismiss
                </button>
              </div>
            ) : job.hasWebhook ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-purple-400">Webhook active</span>
                <button
                  onClick={onGenerateWebhook}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded"
                >
                  Regenerate token
                </button>
                <button
                  onClick={onRevokeWebhook}
                  className="px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 text-xs rounded"
                >
                  Revoke
                </button>
              </div>
            ) : (
              <button
                onClick={onGenerateWebhook}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded"
              >
                Generate webhook token
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Create / Edit modal ────────────────────────────────────────────────────
function JobModal({ editing, form, setForm, formError, saving, credentials, onSave, onClose }) {
  function field(key) {
    return {
      value: form[key],
      onChange: e => setForm(f => ({ ...f, [key]: e.target.value })),
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
          <h3 className="text-white font-bold">{editing ? 'Edit job' : 'New scheduled job'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
        </div>

        <form onSubmit={onSave} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Job name</label>
            <input
              {...field('name')}
              placeholder="e.g. Daily news summary"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Schedule</label>
            <input
              {...field('schedule')}
              placeholder="@daily  or  0 9 * * 1-5"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500"
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {SHORTHANDS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, schedule: s }))}
                  className={`px-2 py-0.5 text-xs rounded font-mono transition-colors ${
                    form.schedule === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Prompt</label>
            <textarea
              {...field('prompt')}
              rows={5}
              placeholder="What should Claude do each time this job runs?"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
            <div className="text-xs text-gray-600 mt-1 text-right">
              {form.prompt.length} / 4000
            </div>
          </div>

          {/* Credential */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">API key <span className="text-gray-600">(optional — uses active key if blank)</span></label>
            <select
              {...field('credentialId')}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— Use active API key —</option>
              {credentials.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Model <span className="text-gray-600">(optional — uses credential default if blank)</span></label>
            <select
              {...field('model')}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— Use credential default —</option>
              {MODELS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Enabled */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))}
              className="w-4 h-4 accent-blue-500"
            />
            <span className="text-sm text-gray-300">Enabled</span>
          </label>

          {formError && (
            <div className="text-red-400 text-sm">{formError}</div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create job'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Scheduler({ token }) {
  const [jobs, setJobs]               = useState([])
  const [credentials, setCredentials] = useState([])
  const [status, setStatus]           = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  const [showModal, setShowModal]     = useState(false)
  const [editingJob, setEditingJob]   = useState(null)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [formError, setFormError]     = useState('')
  const [saving, setSaving]           = useState(false)

  const [expandedId, setExpandedId]   = useState(null)
  const [confirmDelete, setConfirm]   = useState(null)
  const [runningId, setRunningId]     = useState(null)
  const [togglingId, setTogglingId]   = useState(null)
  const [webhookResult, setWebhook]   = useState(null)  // { jobId, token, url }

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [jobsData, credsData, statusData] = await Promise.all([
        api.get('/scheduler/jobs', token),
        api.get('/credentials', token),
        api.get('/scheduler/status', token),
      ])
      setJobs(jobsData)
      setCredentials(credsData)
      setStatus(statusData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setEditingJob(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowModal(true)
  }

  function openEdit(job) {
    setEditingJob(job)
    setForm({
      name:         job.name,
      prompt:       job.prompt,
      schedule:     job.schedule,
      credentialId: job.credentialId || '',
      model:        job.model || '',
      enabled:      job.enabled,
    })
    setFormError('')
    setShowModal(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim())     return setFormError('Name is required')
    if (!form.prompt.trim())   return setFormError('Prompt is required')
    if (!form.schedule.trim()) return setFormError('Schedule is required')
    if (form.prompt.length > 4000) return setFormError('Prompt must be under 4000 characters')

    setSaving(true)
    try {
      const payload = {
        name:         form.name.trim(),
        prompt:       form.prompt.trim(),
        schedule:     form.schedule.trim(),
        credentialId: form.credentialId || null,
        model:        form.model || null,
        enabled:      form.enabled,
      }
      if (editingJob) {
        await api.put(`/scheduler/jobs/${editingJob.id}`, payload, token)
      } else {
        await api.post('/scheduler/jobs', payload, token)
      }
      setShowModal(false)
      loadAll()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/scheduler/jobs/${id}`, token)
      setConfirm(null)
      if (expandedId === id) setExpandedId(null)
      loadAll()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleToggle(job) {
    setTogglingId(job.id)
    try {
      await api.put(`/scheduler/jobs/${job.id}`, { enabled: !job.enabled }, token)
      loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setTogglingId(null)
    }
  }

  async function handleRunNow(job) {
    setRunningId(job.id)
    setError('')
    try {
      await api.post(`/scheduler/jobs/${job.id}/run`, {}, token)
      loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setRunningId(null)
    }
  }

  async function handleGenerateWebhook(job) {
    try {
      const result = await api.post(`/scheduler/jobs/${job.id}/webhook`, {}, token)
      setWebhook({ jobId: job.id, token: result.token, url: result.url })
      setExpandedId(job.id)
      loadAll()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRevokeWebhook(job) {
    if (!confirm('Revoke webhook token? Any integrations using this URL will stop working.')) return
    try {
      await api.delete(`/scheduler/jobs/${job.id}/webhook`, token)
      loadAll()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Loading scheduler…</div>

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Scheduler</h2>
          <p className="text-gray-400 text-sm">
            Proactive jobs that run on a cron schedule and archive results to memory.
            {status && !status.unlocked && (
              <span className="ml-2 text-yellow-400">
                ⚠ Locked — log out and back in to enable job execution
              </span>
            )}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-semibold transition-colors shrink-0"
        >
          + New Job
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-950 border border-red-700 rounded px-4 py-2 text-red-300 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-300 ml-4">✕</button>
        </div>
      )}

      {/* Status bar */}
      {status && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 flex flex-wrap gap-6 text-sm">
          <span className="text-gray-400">Jobs: <span className="text-white">{status.totalJobs}</span></span>
          <span className="text-gray-400">Enabled: <span className="text-white">{status.enabledJobs}</span></span>
          <span className="text-gray-400">
            Scheduler:{' '}
            <span className={status.unlocked ? 'text-green-400' : 'text-yellow-400'}>
              {status.unlocked ? 'unlocked' : 'locked'}
            </span>
          </span>
        </div>
      )}

      {/* Job list */}
      {jobs.length === 0 ? (
        <div className="text-center text-gray-600 py-12">
          <div className="text-4xl mb-3">📅</div>
          <div className="text-gray-400">No scheduled jobs yet.</div>
          <div className="text-sm mt-1">Create a job to run prompts automatically on a cron schedule.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map(job => (
            <JobRow
              key={job.id}
              job={job}
              expanded={expandedId === job.id}
              onToggleExpand={() => setExpandedId(expandedId === job.id ? null : job.id)}
              onEdit={() => openEdit(job)}
              onDelete={() => setConfirm(job.id)}
              onToggle={() => handleToggle(job)}
              onRunNow={() => handleRunNow(job)}
              onGenerateWebhook={() => handleGenerateWebhook(job)}
              onRevokeWebhook={() => handleRevokeWebhook(job)}
              running={runningId === job.id}
              toggling={togglingId === job.id}
              webhookJustGenerated={webhookResult?.jobId === job.id ? webhookResult : null}
              onDismissWebhook={() => setWebhook(null)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <JobModal
          editing={editingJob}
          form={form}
          setForm={setForm}
          formError={formError}
          saving={saving}
          credentials={credentials}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold mb-2">Delete job?</h3>
            <p className="text-gray-400 text-sm mb-4">
              This cannot be undone. Archived results in memory are kept.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirm(null)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

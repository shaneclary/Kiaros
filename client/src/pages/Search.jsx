import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'

// ── Source config ──────────────────────────────────────────────────────────
const SOURCES = [
  { id: 'archive',   label: 'Archive',   colour: 'bg-violet-900 text-violet-300 border-violet-700' },
  { id: 'documents', label: 'Documents', colour: 'bg-blue-900 text-blue-300 border-blue-700' },
  { id: 'sessions',  label: 'Sessions',  colour: 'bg-green-900 text-green-300 border-green-700' },
  { id: 'notes',     label: 'Notes',     colour: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  { id: 'memory',    label: 'Memory',    colour: 'bg-orange-900 text-orange-300 border-orange-700' },
  { id: 'jobs',      label: 'Jobs',      colour: 'bg-pink-900 text-pink-300 border-pink-700' },
]

const SOURCE_MAP = Object.fromEntries(SOURCES.map(s => [s.id, s]))

const LIMITS = [10, 25, 50]

const EXAMPLES = [
  'project deadline',
  'API key setup',
  'meeting notes',
  'shell command',
  'yesterday',
]

// ── Score bar ──────────────────────────────────────────────────────────────
function ScoreBar({ score }) {
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-600">{pct}%</span>
    </div>
  )
}

// ── Source badge ───────────────────────────────────────────────────────────
function SourceBadge({ source }) {
  const cfg = SOURCE_MAP[source] || { label: source, colour: 'bg-gray-800 text-gray-400 border-gray-700' }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono border ${cfg.colour}`}>
      {cfg.label}
    </span>
  )
}

// ── Single result card ─────────────────────────────────────────────────────
function ResultCard({ result, onSessionClick }) {
  const meta = result.meta || {}

  function metaLine() {
    if (result.source === 'sessions' || result.type === 'message') {
      return (
        <button
          onClick={() => onSessionClick(meta.sessionId)}
          className="text-xs text-blue-400 hover:underline"
        >
          {meta.sessionTitle || 'Untitled session'} · {meta.role}
        </button>
      )
    }
    if (result.source === 'documents' || result.type === 'document_chunk') {
      return <span className="text-xs text-gray-500">{meta.filename}</span>
    }
    if (result.source === 'memory' || result.type === 'memory') {
      return <span className="text-xs text-gray-500">key: {meta.key}</span>
    }
    if (result.source === 'jobs' || result.type === 'job_result') {
      return <span className="text-xs text-gray-500">{meta.jobName}</span>
    }
    if (result.source === 'notes' || result.type === 'note') {
      return <span className="text-xs text-gray-500">{meta.filename}</span>
    }
    return null
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <SourceBadge source={result.source || result.type} />
        <ScoreBar score={result.score} />
        <div className="ml-auto">{metaLine()}</div>
      </div>
      <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap break-words">
        {result.content}
      </p>
    </div>
  )
}

// ── Skeleton loader ────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-4 animate-pulse">
          <div className="flex gap-2 mb-3">
            <div className="w-16 h-4 bg-gray-800 rounded" />
            <div className="w-20 h-4 bg-gray-800 rounded" />
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-800 rounded w-full" />
            <div className="h-3 bg-gray-800 rounded w-4/5" />
            <div className="h-3 bg-gray-800 rounded w-3/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Search({ token }) {
  const navigate = useNavigate()

  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState(null)   // null = no search yet
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [activeSources, setActive]  = useState(() => new Set(SOURCES.map(s => s.id)))
  const [limit, setLimit]           = useState(10)

  const debounceRef = useRef(null)
  const inputRef    = useRef(null)

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  const doSearch = useCallback(async (q, sources, lim) => {
    if (!q.trim()) { setResults(null); return }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        q,
        sources: [...sources].join(','),
        limit:   String(lim),
      })
      const data = await api.get(`/search?${params}`, token)
      setResults(data)
    } catch (err) {
      setError(err.message)
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  function scheduleSearch(q, sources, lim) {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(q, sources, lim), 300)
  }

  function handleQueryChange(e) {
    const q = e.target.value
    setQuery(q)
    scheduleSearch(q, activeSources, limit)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      clearTimeout(debounceRef.current)
      doSearch(query, activeSources, limit)
    }
  }

  function toggleSource(id) {
    setActive(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size === 1) return prev  // keep at least one
        next.delete(id)
      } else {
        next.add(id)
      }
      scheduleSearch(query, next, limit)
      return next
    })
  }

  function handleLimitChange(l) {
    setLimit(l)
    scheduleSearch(query, activeSources, l)
  }

  function handleExampleClick(q) {
    setQuery(q)
    clearTimeout(debounceRef.current)
    doSearch(q, activeSources, limit)
  }

  function handleSessionClick(sessionId) {
    if (sessionId) navigate(`/chat?session=${sessionId}`)
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Search</h2>
        <p className="text-gray-400 text-sm">
          Search across all memory sources simultaneously.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          placeholder="Search archive, documents, sessions, notes, memory…"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults(null) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {/* Source filter chips + limit */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 shrink-0">Sources:</span>
        {SOURCES.map(s => (
          <button
            key={s.id}
            onClick={() => toggleSource(s.id)}
            className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
              activeSources.has(s.id)
                ? s.colour
                : 'bg-transparent text-gray-600 border-gray-700 hover:border-gray-600'
            }`}
          >
            {s.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-gray-500">Limit:</span>
          {LIMITS.map(l => (
            <button
              key={l}
              onClick={() => handleLimitChange(l)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                limit === l
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-700 rounded px-4 py-2 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Results area */}
      {loading && <Skeleton />}

      {!loading && results && (
        <>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{results.total} result{results.total !== 1 ? 's' : ''} for <span className="text-gray-300">"{results.query}"</span></span>
            <span>showing {Math.min(results.total, limit)}</span>
          </div>
          {results.results.length === 0 ? (
            <div className="text-center py-10 text-gray-600">
              <div className="text-3xl mb-2">🔍</div>
              <div>No results found.</div>
              <div className="text-sm mt-1">Try different keywords or enable more sources.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {results.results.map((r, i) => (
                <ResultCard
                  key={`${r.source}-${r.id}-${i}`}
                  result={r}
                  onSessionClick={handleSessionClick}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Empty state / examples */}
      {!loading && !results && !error && (
        <div className="text-center py-10">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-gray-500 text-sm mb-4">Search across archive, documents, sessions, notes, memory, and job results.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLES.map(q => (
              <button
                key={q}
                onClick={() => handleExampleClick(q)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm rounded-full transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useRef, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, SafeAreaView
} from 'react-native'
import { router } from 'expo-router'
import { api } from '../../lib/api'
import { useAuth } from '../_layout'

interface SearchResult {
  id: string
  source: string
  content: string
  score: number
  meta?: Record<string, string>
}

const SOURCES = ['archive', 'documents', 'sessions', 'notes', 'memory', 'jobs'] as const
type Source = typeof SOURCES[number]

const SOURCE_COLOR: Record<Source, string> = {
  archive:   '#818cf8',
  documents: '#60a5fa',
  sessions:  '#34d399',
  notes:     '#fbbf24',
  memory:    '#a78bfa',
  jobs:      '#f97316',
}

const EXAMPLES = [
  'What did I work on last week?',
  'Python async patterns',
  'Meeting notes about the project',
  'API keys and credentials',
  'Recent file changes',
]

export default function SearchScreen() {
  const { token } = useAuth()
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [sources, setSources]     = useState<Set<Source>>(new Set(SOURCES))
  const [limit, setLimit]         = useState(25)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async (q: string, srcs: Set<Source>, lim: number) => {
    if (!q.trim()) { setResults([]); setHasSearched(false); return }
    setSearching(true)
    setHasSearched(true)
    try {
      const srcParam = Array.from(srcs).join(',')
      const data = await api.get(`/search?q=${encodeURIComponent(q)}&sources=${srcParam}&limit=${lim}`, token ?? undefined) as SearchResult[]
      setResults(data)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [token])

  function handleQueryChange(text: string) {
    setQuery(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(text, sources, limit), 300)
  }

  function toggleSource(src: Source) {
    setSources(prev => {
      const next = new Set(prev)
      if (next.has(src)) {
        if (next.size === 1) return prev // keep at least one
        next.delete(src)
      } else {
        next.add(src)
      }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => doSearch(query, next, limit), 300)
      return next
    })
  }

  function handleExample(ex: string) {
    setQuery(ex)
    doSearch(ex, sources, limit)
  }

  function handleResultTap(result: SearchResult) {
    if (result.source === 'sessions' && result.meta?.session_id) {
      router.push(`/(tabs)/chat?session=${result.meta.session_id}`)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#030712' }}>
      {/* Search bar */}
      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#374151', borderRadius: 10, paddingHorizontal: 12 }}>
          <Text style={{ color: '#6b7280', fontSize: 16, marginRight: 8 }}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={handleQueryChange}
            placeholder="Search across all your knowledge…"
            placeholderTextColor="#4b5563"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => doSearch(query, sources, limit)}
            style={{ flex: 1, color: '#ffffff', fontSize: 15, paddingVertical: 12 }}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setHasSearched(false) }}>
              <Text style={{ color: '#6b7280', fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Source chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {SOURCES.map(src => (
            <TouchableOpacity
              key={src}
              onPress={() => toggleSource(src)}
              style={{
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
                backgroundColor: sources.has(src) ? SOURCE_COLOR[src] + '33' : '#1f2937',
                borderWidth: 1,
                borderColor: sources.has(src) ? SOURCE_COLOR[src] : '#374151'
              }}
            >
              <Text style={{ color: sources.has(src) ? SOURCE_COLOR[src] : '#6b7280', fontSize: 12 }}>
                {src}
              </Text>
            </TouchableOpacity>
          ))}
          {/* Limit selector */}
          {([10, 25, 50] as const).map(l => (
            <TouchableOpacity
              key={l}
              onPress={() => { setLimit(l); doSearch(query, sources, l) }}
              style={{
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
                backgroundColor: limit === l ? '#374151' : 'transparent',
                borderWidth: 1, borderColor: limit === l ? '#6b7280' : '#374151'
              }}
            >
              <Text style={{ color: limit === l ? '#d1d5db' : '#6b7280', fontSize: 12 }}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Results */}
      {searching ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#3b82f6" />
          <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 12 }}>Searching…</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 12, flexGrow: 1 }}
          ListEmptyComponent={
            !hasSearched ? (
              <View style={{ paddingTop: 40 }}>
                <Text style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
                  Try one of these:
                </Text>
                {EXAMPLES.map(ex => (
                  <TouchableOpacity key={ex} onPress={() => handleExample(ex)}
                    style={{ backgroundColor: '#111827', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#1f2937' }}>
                    <Text style={{ color: '#9ca3af', fontSize: 14 }}>{ex}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 }}>
                <Text style={{ fontSize: 36, marginBottom: 12 }}>🔍</Text>
                <Text style={{ color: '#6b7280', fontSize: 15 }}>No results found</Text>
                <Text style={{ color: '#4b5563', fontSize: 13, marginTop: 6 }}>Try different keywords or sources</Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleResultTap(item)}
              style={{ backgroundColor: '#111827', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#1f2937' }}
              activeOpacity={item.source === 'sessions' ? 0.7 : 1}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {/* Source badge */}
                <View style={{ backgroundColor: (SOURCE_COLOR[item.source as Source] ?? '#374151') + '33', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: SOURCE_COLOR[item.source as Source] ?? '#374151' }}>
                  <Text style={{ color: SOURCE_COLOR[item.source as Source] ?? '#9ca3af', fontSize: 10, fontWeight: '700' }}>
                    {item.source}
                  </Text>
                </View>
                {/* Score bar */}
                <View style={{ flex: 1, height: 3, backgroundColor: '#1f2937', borderRadius: 2 }}>
                  <View style={{ height: 3, borderRadius: 2, backgroundColor: '#3b82f6', width: `${Math.min(Math.round(item.score * 100), 100)}%` }} />
                </View>
                <Text style={{ color: '#4b5563', fontSize: 10 }}>{Math.round(item.score * 100)}%</Text>
                {item.source === 'sessions' && <Text style={{ color: '#60a5fa', fontSize: 10 }}>↗</Text>}
              </View>

              <Text style={{ color: '#e5e7eb', fontSize: 13, lineHeight: 19 }} numberOfLines={4}>
                {item.content}
              </Text>

              {item.meta && Object.keys(item.meta).length > 0 && (
                <Text style={{ color: '#6b7280', fontSize: 11, marginTop: 6 }}>
                  {Object.values(item.meta).filter(Boolean).join(' · ')}
                </Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}

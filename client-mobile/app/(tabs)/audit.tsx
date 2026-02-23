import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, FlatList, Modal,
  Alert, ActivityIndicator, SafeAreaView, ScrollView, Platform
} from 'react-native'
import { api } from '../../lib/api'
import { relativeTime } from '../../lib/time'
import { useAuth } from '../_layout'

interface AuditEntry {
  id: string
  tool_id: string
  tool_name: string
  input: unknown
  output: unknown
  approved_by: string
  duration_ms: number | null
  token_cost: number | null
  reversible: number
  reversed: number
  error: string | null
  created_at: string
  session_id: string | null
}

const STATUS_COLOR = {
  success: '#34d399',
  failed:  '#f87171',
  pending: '#fbbf24',
}

function getStatus(e: AuditEntry): 'success' | 'failed' | 'pending' {
  if (e.error) return 'failed'
  if (e.output) return 'success'
  return 'pending'
}

export default function AuditScreen() {
  const { token } = useAuth()
  const [entries, setEntries]     = useState<AuditEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(1)
  const [hasMore, setHasMore]     = useState(false)
  const [detail, setDetail]       = useState<AuditEntry | null>(null)
  const [undoing, setUndoing]     = useState<string | null>(null)
  const [error, setError]         = useState('')

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const data = await api.get(`/audit?page=${p}&limit=30`, token ?? undefined) as { entries: AuditEntry[] }
      setEntries(data.entries)
      setHasMore(data.entries.length === 30)
      setPage(p)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load(1) }, [load])

  async function handleUndo(entry: AuditEntry) {
    Alert.alert('Undo action', `Undo "${entry.tool_name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo', style: 'destructive',
        onPress: async () => {
          setUndoing(entry.id)
          try {
            await api.post(`/audit/${entry.id}/undo`, {}, token ?? undefined)
            setDetail(null)
            load(page)
          } catch (e: unknown) {
            Alert.alert('Undo failed', e instanceof Error ? e.message : 'Unknown error')
          } finally {
            setUndoing(null)
          }
        }
      }
    ])
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#030712' }}>
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
        <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700' }}>📋 Audit Log</Text>
        <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>Every tool call — append-only, immutable</Text>
      </View>

      {error ? (
        <Text style={{ color: '#f87171', fontSize: 13, padding: 16 }}>{error}</Text>
      ) : null}

      {loading && entries.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#3b82f6" />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>📋</Text>
              <Text style={{ color: '#6b7280', fontSize: 16 }}>No audit entries yet</Text>
            </View>
          }
          ListFooterComponent={
            entries.length > 0 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: 16 }}>
                {page > 1 && (
                  <TouchableOpacity onPress={() => load(page - 1)} style={{ backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
                    <Text style={{ color: '#9ca3af' }}>← Prev</Text>
                  </TouchableOpacity>
                )}
                <Text style={{ color: '#6b7280', paddingVertical: 8 }}>Page {page}</Text>
                {hasMore && (
                  <TouchableOpacity onPress={() => load(page + 1)} style={{ backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
                    <Text style={{ color: '#9ca3af' }}>Next →</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const status = getStatus(item)
            return (
              <TouchableOpacity
                onPress={() => setDetail(item)}
                style={{ backgroundColor: '#111827', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#1f2937' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: STATUS_COLOR[status], fontSize: 10, fontWeight: '700', textTransform: 'uppercase', width: 48 }}>
                    {status}
                  </Text>
                  <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                    {item.tool_name}
                  </Text>
                  {item.reversible && !item.reversed ? (
                    <Text style={{ color: '#60a5fa', fontSize: 10 }}>↩</Text>
                  ) : null}
                  {item.reversed ? (
                    <Text style={{ color: '#6b7280', fontSize: 10 }}>undone</Text>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                  <Text style={{ color: '#6b7280', fontSize: 11 }}>{relativeTime(item.created_at)}</Text>
                  {item.duration_ms ? <Text style={{ color: '#6b7280', fontSize: 11 }}>{item.duration_ms}ms</Text> : null}
                  <Text style={{ color: '#4b5563', fontSize: 11 }}>{item.approved_by}</Text>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}

      {/* Detail modal */}
      <Modal visible={!!detail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetail(null)}>
        {detail && (
          <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>{detail.tool_name}</Text>
                <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>{relativeTime(detail.created_at)}</Text>
              </View>
              <TouchableOpacity onPress={() => setDetail(null)}>
                <Text style={{ color: '#6b7280', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              {detail.input ? (
                <DetailBlock label="Input" color="#d1d5db">
                  {JSON.stringify(detail.input, null, 2)}
                </DetailBlock>
              ) : null}
              {detail.output ? (
                <DetailBlock label="Output" color="#86efac">
                  {JSON.stringify(detail.output, null, 2)}
                </DetailBlock>
              ) : null}
              {detail.error ? (
                <DetailBlock label="Error" color="#fca5a5">{detail.error}</DetailBlock>
              ) : null}

              {detail.reversible && !detail.reversed ? (
                <TouchableOpacity
                  onPress={() => handleUndo(detail)}
                  disabled={!!undoing}
                  style={{ backgroundColor: '#78350f', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 }}
                >
                  {undoing === detail.id
                    ? <ActivityIndicator color="#fbbf24" size="small" />
                    : <Text style={{ color: '#fcd34d', fontWeight: '600' }}>↩ Undo this action</Text>
                  }
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  )
}

function DetailBlock({ label, color, children }: { label: string; color: string; children: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <View style={{ backgroundColor: '#1f2937', borderRadius: 8, padding: 12 }}>
        <Text style={{ color, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 18 }}>
          {children}
        </Text>
      </View>
    </View>
  )
}

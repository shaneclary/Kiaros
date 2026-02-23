import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, FlatList, Modal, Switch,
  Alert, ActivityIndicator, SafeAreaView, ScrollView
} from 'react-native'
import { api } from '../../lib/api'
import { useAuth } from '../_layout'

interface Tool {
  id: string
  name: string
  description: string
  required_scopes: string[]
  risk_level: string
  reversible: boolean
  sandboxed: boolean
  enabled: boolean
  mcp_config: unknown
  approvedScopes?: string[]
}

const RISK_COLOR: Record<string, string> = {
  low:     '#34d399',
  medium:  '#fbbf24',
  high:    '#f87171',
  unknown: '#6b7280',
}

export default function ToolsScreen() {
  const { token } = useAuth()
  const [tools, setTools]       = useState<Tool[]>([])
  const [scopes, setScopes]     = useState<Record<string, { scopes: string[]; confirmEachUse: boolean }>>({})
  const [loading, setLoading]   = useState(true)
  const [detail, setDetail]     = useState<Tool | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError]       = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.get('/tools', token ?? undefined) as {
        tools: Tool[]
        scopes: Record<string, { scopes: string[]; confirmEachUse: boolean }>
      }
      const enriched = data.tools.map(t => ({
        ...t,
        approvedScopes: data.scopes[t.id]?.scopes ?? []
      }))
      setTools(enriched)
      setScopes(data.scopes)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  async function toggleEnabled(tool: Tool) {
    setToggling(tool.id)
    try {
      await api.put(`/tools/${tool.id}`, { enabled: !tool.enabled }, token ?? undefined)
      setTools(prev => prev.map(t => t.id === tool.id ? { ...t, enabled: !t.enabled } : t))
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Toggle failed')
    } finally {
      setToggling(null)
    }
  }

  function openDetail(tool: Tool) {
    setDetail({ ...tool, approvedScopes: scopes[tool.id]?.scopes ?? [] })
  }

  async function approveAllScopes(tool: Tool) {
    try {
      await api.post(`/tools/${tool.id}/approve`, { scopes: tool.required_scopes, confirmEachUse: false }, token ?? undefined)
      setScopes(prev => ({ ...prev, [tool.id]: { scopes: tool.required_scopes, confirmEachUse: false } }))
      setDetail(prev => prev ? { ...prev, approvedScopes: tool.required_scopes } : prev)
      setTools(prev => prev.map(t => t.id === tool.id ? { ...t, approvedScopes: tool.required_scopes } : t))
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Approve failed')
    }
  }

  async function revokeScopes(tool: Tool) {
    Alert.alert('Revoke approval', `Remove all scope approvals for "${tool.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/tools/${tool.id}/approve`, token ?? undefined)
            setScopes(prev => { const n = { ...prev }; delete n[tool.id]; return n })
            setDetail(prev => prev ? { ...prev, approvedScopes: [] } : prev)
            setTools(prev => prev.map(t => t.id === tool.id ? { ...t, approvedScopes: [] } : t))
          } catch (e: unknown) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Revoke failed')
          }
        }
      }
    ])
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#030712' }}>
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
        <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700' }}>🔧 Tools</Text>
        <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
          {tools.filter(t => t.enabled).length} enabled · tap to manage scopes
        </Text>
      </View>

      {error ? <Text style={{ color: '#f87171', padding: 16, fontSize: 13 }}>{error}</Text> : null}

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#3b82f6" />
        </View>
      ) : (
        <FlatList
          data={tools}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => {
            const approved = item.approvedScopes ?? []
            const hasAllScopes = item.required_scopes.every(s => approved.includes(s))
            return (
              <TouchableOpacity
                onPress={() => openDetail(item)}
                style={{ backgroundColor: '#111827', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#1f2937', opacity: item.enabled ? 1 : 0.6 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>{item.name}</Text>
                      <Text style={{ color: RISK_COLOR[item.risk_level] ?? '#6b7280', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                        {item.risk_level}
                      </Text>
                    </View>
                    <Text style={{ color: '#9ca3af', fontSize: 12, lineHeight: 17 }} numberOfLines={2}>{item.description}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      {hasAllScopes
                        ? <Text style={{ color: '#34d399', fontSize: 11 }}>✓ Scopes approved</Text>
                        : <Text style={{ color: '#fbbf24', fontSize: 11 }}>⚠ Needs scope approval</Text>
                      }
                      {item.mcp_config ? <Text style={{ color: '#818cf8', fontSize: 10 }}>MCP</Text> : null}
                    </View>
                  </View>
                  {toggling === item.id ? (
                    <ActivityIndicator color="#3b82f6" size="small" style={{ marginLeft: 12 }} />
                  ) : (
                    <Switch
                      value={item.enabled}
                      onValueChange={() => toggleEnabled(item)}
                      trackColor={{ false: '#374151', true: '#2563eb' }}
                      thumbColor="#ffffff"
                    />
                  )}
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}

      {/* Tool detail / scope approval modal */}
      <Modal visible={!!detail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetail(null)}>
        {detail && (
          <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700' }}>{detail.name}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Text style={{ color: RISK_COLOR[detail.risk_level] ?? '#6b7280', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
                    {detail.risk_level} risk
                  </Text>
                  {detail.reversible && <Text style={{ color: '#60a5fa', fontSize: 11 }}>reversible</Text>}
                  {detail.sandboxed && <Text style={{ color: '#34d399', fontSize: 11 }}>sandboxed</Text>}
                </View>
              </View>
              <TouchableOpacity onPress={() => setDetail(null)}>
                <Text style={{ color: '#6b7280', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <Text style={{ color: '#9ca3af', fontSize: 14, lineHeight: 20, marginBottom: 20 }}>{detail.description}</Text>

              <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Required scopes
              </Text>
              {detail.required_scopes.map(scope => {
                const isApproved = (detail.approvedScopes ?? []).includes(scope)
                return (
                  <View key={scope} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
                    <Text style={{ color: isApproved ? '#34d399' : '#fbbf24', fontSize: 16 }}>
                      {isApproved ? '✓' : '○'}
                    </Text>
                    <Text style={{ color: '#e5e7eb', fontSize: 13, fontFamily: 'monospace', flex: 1 }}>{scope}</Text>
                    {isApproved && <Text style={{ color: '#4b5563', fontSize: 11 }}>approved</Text>}
                  </View>
                )
              })}

              <View style={{ gap: 10, marginTop: 24 }}>
                {!detail.required_scopes.every(s => (detail.approvedScopes ?? []).includes(s)) && (
                  <TouchableOpacity
                    onPress={() => approveAllScopes(detail)}
                    style={{ backgroundColor: '#1d4ed8', borderRadius: 8, padding: 12, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#ffffff', fontWeight: '600' }}>Approve all required scopes</Text>
                  </TouchableOpacity>
                )}
                {(detail.approvedScopes ?? []).length > 0 && (
                  <TouchableOpacity
                    onPress={() => revokeScopes(detail)}
                    style={{ backgroundColor: '#1f2937', borderRadius: 8, padding: 12, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#f87171', fontWeight: '600' }}>Revoke scope approval</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  )
}

import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Modal, Alert, ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform
} from 'react-native'
import { api } from '../../lib/api'
import { relativeTime } from '../../lib/time'
import { useAuth } from '../_layout'

interface MemoryItem {
  key: string
  value: string
  source: string
  updated_at: string
}

export default function MemoryScreen() {
  const { token } = useAuth()
  const [memories, setMemories]   = useState<MemoryItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem]   = useState<MemoryItem | null>(null)
  const [mKey, setMKey]           = useState('')
  const [mValue, setMValue]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.get('/memory/working', token ?? undefined) as MemoryItem[]
      setMemories(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditItem(null)
    setMKey('')
    setMValue('')
    setError('')
    setShowModal(true)
  }

  function openEdit(item: MemoryItem) {
    setEditItem(item)
    setMKey(item.key)
    setMValue(item.value)
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!mKey.trim()) return setError('Key is required')
    if (!mValue.trim()) return setError('Value is required')
    setSaving(true)
    setError('')
    try {
      await api.put(`/memory/working/${encodeURIComponent(mKey.trim())}`, { value: mValue.trim() }, token ?? undefined)
      setShowModal(false)
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete(item: MemoryItem) {
    Alert.alert('Delete memory', `Delete "${item.key}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/memory/working/${encodeURIComponent(item.key)}`, token ?? undefined)
            load()
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Delete failed')
          }
        }
      }
    ])
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#030712' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
        <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700', flex: 1 }}>🧠 Memory</Text>
        <TouchableOpacity onPress={openAdd} style={{ backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 13 }}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#3b82f6" />
        </View>
      ) : (
        <FlatList
          data={memories}
          keyExtractor={item => item.key}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>🧠</Text>
              <Text style={{ color: '#6b7280', fontSize: 16 }}>No memories yet</Text>
              <Text style={{ color: '#4b5563', fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 }}>
                Add facts about yourself that Kiaros should always remember.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ backgroundColor: '#111827', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1f2937' }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Text style={{ color: '#60a5fa', fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: '600' }}>
                      {item.key}
                    </Text>
                    <Text style={{ color: '#4b5563', fontSize: 11 }}>{item.source}</Text>
                  </View>
                  <Text style={{ color: '#e5e7eb', fontSize: 14, lineHeight: 20 }}>{item.value}</Text>
                  <Text style={{ color: '#4b5563', fontSize: 11, marginTop: 6 }}>Updated {relativeTime(item.updated_at)}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 10 }}>
                  <TouchableOpacity onPress={() => openEdit(item)} style={{ backgroundColor: '#374151', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ color: '#d1d5db', fontSize: 12 }}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDelete(item)} style={{ backgroundColor: '#7f1d1d', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ color: '#fca5a5', fontSize: 12 }}>Del</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#0f172a' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
            <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700', flex: 1 }}>
              {editItem ? 'Edit Memory' : 'Add Memory'}
            </Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={{ color: '#6b7280', fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={{ padding: 20 }}>
            <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Key</Text>
            <TextInput
              value={mKey}
              onChangeText={setMKey}
              placeholder="e.g. preferred_language"
              placeholderTextColor="#4b5563"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!editItem}
              style={{
                backgroundColor: '#1f2937',
                borderWidth: 1,
                borderColor: editItem ? '#374151' : '#374151',
                borderRadius: 8,
                padding: 12,
                color: editItem ? '#6b7280' : '#ffffff',
                fontSize: 14,
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                marginBottom: 16
              }}
            />

            <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Value</Text>
            <TextInput
              value={mValue}
              onChangeText={setMValue}
              placeholder="e.g. TypeScript"
              placeholderTextColor="#4b5563"
              multiline
              numberOfLines={4}
              style={{
                backgroundColor: '#1f2937',
                borderWidth: 1,
                borderColor: '#374151',
                borderRadius: 8,
                padding: 12,
                color: '#ffffff',
                fontSize: 14,
                marginBottom: error ? 8 : 20,
                minHeight: 100,
                textAlignVertical: 'top'
              }}
            />

            {error ? <Text style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</Text> : null}

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={{ backgroundColor: '#2563eb', opacity: saving ? 0.6 : 1, borderRadius: 8, padding: 14, alignItems: 'center' }}
            >
              {saving
                ? <ActivityIndicator color="#ffffff" />
                : <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 15 }}>Save memory</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Alert, ActivityIndicator, SafeAreaView, ScrollView
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import { api } from '../../lib/api'
import { relativeTime } from '../../lib/time'
import { useAuth } from '../_layout'

interface DocStatus {
  watching: boolean
  queueDepth: number
  docCount: number
  docsDir: string
}

interface Doc {
  id: string
  filename: string
  mime_type: string | null
  size_bytes: number | null
  chunk_count: number
  indexed_at: string
  error: string | null
}

const MIME_COLOR: Record<string, string> = {
  'application/pdf':       '#ef4444',
  'text/markdown':         '#60a5fa',
  'text/html':             '#f97316',
  'application/json':      '#eab308',
  'text/plain':            '#6b7280',
}

function mimeLabel(mime: string | null): string {
  if (!mime) return 'FILE'
  if (mime.includes('pdf'))      return 'PDF'
  if (mime.includes('markdown')) return 'MD'
  if (mime.includes('html'))     return 'HTML'
  if (mime.includes('json'))     return 'JSON'
  if (mime.includes('text'))     return 'TXT'
  return 'FILE'
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export default function DocumentsScreen() {
  const { token } = useAuth()
  const [status, setStatus]     = useState<DocStatus | null>(null)
  const [docs, setDocs]         = useState<Doc[]>([])
  const [loading, setLoading]   = useState(true)
  const [scanning, setScanning] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pathInput, setPathInput] = useState('')
  const [ingesting, setIngesting] = useState(false)
  const [ingestMsg, setIngestMsg] = useState('')
  const [expanded, setExpanded]  = useState<string | null>(null)
  const [error, setError]        = useState('')

  const load = useCallback(async () => {
    try {
      const [statusData, docsData] = await Promise.all([
        api.get('/documents/status', token ?? undefined) as Promise<DocStatus>,
        api.get('/documents', token ?? undefined) as Promise<Doc[]>
      ])
      setStatus(statusData)
      setDocs(docsData)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  async function handleRescan() {
    setScanning(true)
    try {
      const result = await api.post('/documents/scan', {}, token ?? undefined) as { queued?: number }
      Alert.alert('Rescan started', `${result.queued ?? 0} files queued for indexing.`)
      setTimeout(load, 2000)
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Rescan failed')
    } finally {
      setScanning(false)
    }
  }

  async function handleIngestPath() {
    const p = pathInput.trim()
    if (!p) return
    setIngesting(true)
    setIngestMsg('')
    try {
      const result = await api.post('/documents/ingest', { path: p }, token ?? undefined) as { skipped?: boolean; chunks?: number }
      setIngestMsg(result.skipped ? 'File unchanged — skipped' : `Indexed · ${result.chunks ?? 0} chunks`)
      setPathInput('')
      load()
    } catch (e: unknown) {
      setIngestMsg(e instanceof Error ? e.message : 'Ingest failed')
    } finally {
      setIngesting(false)
      setTimeout(() => setIngestMsg(''), 4000)
    }
  }

  // Phase G — document picker + base64 upload
  async function handlePickDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/*', 'application/json'],
        copyToCacheDirectory: true
      })
      if (result.canceled || !result.assets?.length) return

      const asset = result.assets[0]
      setUploading(true)

      // Read file as base64
      const content_base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64
      })

      const uploadResult = await api.post('/documents/upload', {
        filename: asset.name,
        content_base64,
        mime_type: asset.mimeType
      }, token ?? undefined) as { chunks?: number }

      Alert.alert('Document imported', `"${asset.name}" indexed · ${uploadResult.chunks ?? 0} chunks`)
      load()
    } catch (e: unknown) {
      if (e instanceof Error && !e.message.includes('cancel')) {
        Alert.alert('Import failed', e.message)
      }
    } finally {
      setUploading(false)
    }
  }

  function confirmDelete(doc: Doc) {
    Alert.alert('Delete document', `Remove "${doc.filename}" from the index?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/documents/${doc.id}`, token ?? undefined)
            load()
          } catch (e: unknown) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Delete failed')
          }
        }
      }
    ])
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#030712' }}>
      {/* Header */}
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700', flex: 1 }}>📄 Documents</Text>
          <TouchableOpacity onPress={handleRescan} disabled={scanning}
            style={{ backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
            {scanning
              ? <ActivityIndicator color="#9ca3af" size="small" />
              : <Text style={{ color: '#9ca3af', fontSize: 13 }}>↻ Rescan</Text>
            }
          </TouchableOpacity>
        </View>
        {status && (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatusChip color={status.watching ? '#34d399' : '#f87171'} label={status.watching ? 'Watching' : 'Stopped'} />
            <StatusChip color="#6b7280" label={`${status.docCount} docs`} />
            {status.queueDepth > 0 && <StatusChip color="#fbbf24" label={`${status.queueDepth} queued`} />}
          </View>
        )}
      </View>

      {error ? <Text style={{ color: '#f87171', padding: 16, fontSize: 13 }}>{error}</Text> : null}

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#3b82f6" />
        </View>
      ) : (
        <FlatList
          data={docs}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 12, flexGrow: 1, paddingBottom: 160 }}
          ListHeaderComponent={
            <View style={{ marginBottom: 16 }}>
              {/* Import from device */}
              <TouchableOpacity
                onPress={handlePickDocument}
                disabled={uploading}
                style={{ backgroundColor: '#1d4ed8', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10, opacity: uploading ? 0.6 : 1 }}
              >
                {uploading
                  ? <ActivityIndicator color="#ffffff" />
                  : <Text style={{ color: '#ffffff', fontWeight: '600' }}>📁 Import from device</Text>
                }
              </TouchableOpacity>

              {/* Ingest by server path */}
              <View style={{ backgroundColor: '#111827', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#1f2937' }}>
                <Text style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>Ingest server-side path</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={pathInput}
                    onChangeText={setPathInput}
                    placeholder="/home/user/file.pdf"
                    placeholderTextColor="#4b5563"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onSubmitEditing={handleIngestPath}
                    style={{ flex: 1, backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#374151', borderRadius: 8, padding: 10, color: '#ffffff', fontSize: 13 }}
                  />
                  <TouchableOpacity onPress={handleIngestPath} disabled={ingesting || !pathInput.trim()}
                    style={{ backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center', opacity: ingesting || !pathInput.trim() ? 0.6 : 1 }}>
                    {ingesting
                      ? <ActivityIndicator color="#ffffff" size="small" />
                      : <Text style={{ color: '#ffffff', fontWeight: '600' }}>Ingest</Text>
                    }
                  </TouchableOpacity>
                </View>
                {ingestMsg ? <Text style={{ color: ingestMsg.includes('Error') || ingestMsg.includes('fail') ? '#f87171' : '#34d399', fontSize: 12, marginTop: 8 }}>{ingestMsg}</Text> : null}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={{ justifyContent: 'center', alignItems: 'center', paddingTop: 40 }}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>📄</Text>
              <Text style={{ color: '#6b7280', fontSize: 16 }}>No documents indexed</Text>
              <Text style={{ color: '#4b5563', fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 }}>
                Import files above or add files to the documents directory.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setExpanded(expanded === item.id ? null : item.id)}
              style={{ backgroundColor: '#111827', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: item.error ? '#7f1d1d' : '#1f2937' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ backgroundColor: MIME_COLOR[item.mime_type ?? ''] ?? '#374151', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '700' }}>{mimeLabel(item.mime_type)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{item.filename}</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <Text style={{ color: '#6b7280', fontSize: 11 }}>{formatBytes(item.size_bytes)}</Text>
                    <Text style={{ color: '#6b7280', fontSize: 11 }}>{item.chunk_count} chunks</Text>
                    <Text style={{ color: '#6b7280', fontSize: 11 }}>{relativeTime(item.indexed_at)}</Text>
                    {item.error && <Text style={{ color: '#f87171', fontSize: 11 }}>⚠ error</Text>}
                  </View>
                </View>
              </View>

              {expanded === item.id && (
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#1f2937', paddingTop: 12 }}>
                  {item.error && (
                    <Text style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>Error: {item.error}</Text>
                  )}
                  <TouchableOpacity onPress={() => confirmDelete(item)}
                    style={{ backgroundColor: '#7f1d1d', borderRadius: 8, padding: 10, alignItems: 'center' }}>
                    <Text style={{ color: '#fca5a5', fontWeight: '600' }}>Remove from index</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}

function StatusChip({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color: '#9ca3af', fontSize: 12 }}>{label}</Text>
    </View>
  )
}

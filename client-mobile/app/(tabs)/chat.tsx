import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, Modal, ScrollView,
  ActivityIndicator, SafeAreaView
} from 'react-native'
import { router } from 'expo-router'
import { api } from '../../lib/api'
import { streamChat } from '../../lib/sse'
import { relativeTime } from '../../lib/time'
import { useAuth } from '../_layout'

interface Session { id: string; title: string; last_active_at: string }
interface Message { id?: string; role: 'user' | 'assistant'; content: string; createdAt?: string }

export default function ChatScreen() {
  const { token, signOut } = useAuth()

  const [sessions, setSessions]           = useState<Session[]>([])
  const [currentSession, setCurrentSession] = useState<Session | null>(null)
  const [messages, setMessages]           = useState<Message[]>([])
  const [input, setInput]                 = useState('')
  const [streaming, setStreaming]         = useState(false)
  const [streamText, setStreamText]       = useState('')
  const [showSessions, setShowSessions]   = useState(false)
  const [reflecting, setReflecting]       = useState(false)
  const [reflectMsg, setReflectMsg]       = useState('')

  const listRef = useRef<FlatList>(null)

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.get('/chat/sessions', token ?? undefined) as Session[]
      setSessions(data)
    } catch {}
  }, [token])

  const loadSession = useCallback(async (session: Session) => {
    try {
      const msgs = await api.get(`/chat/sessions/${session.id}`, token ?? undefined) as Message[]
      setCurrentSession(session)
      setMessages(msgs)
      setStreamText('')
      setShowSessions(false)
    } catch {}
  }, [token])

  useEffect(() => { loadSessions() }, [loadSessions])

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [messages, streamText])

  async function handleSend() {
    const msg = input.trim()
    if (!msg || streaming) return
    setInput('')
    setStreaming(true)
    setStreamText('')

    const userMsg: Message = { role: 'user', content: msg, createdAt: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])

    let sessionId = currentSession?.id ?? null
    let fullText = ''

    try {
      await streamChat({
        message: msg,
        sessionId,
        token: token ?? undefined,
        onEvent: (event, data) => {
          if (event === 'session') {
            sessionId = (data as { sessionId: string }).sessionId
            // Update current session reference
            setCurrentSession(prev => prev ?? { id: sessionId!, title: msg.slice(0, 40), last_active_at: new Date().toISOString() })
          } else if (event === 'token') {
            fullText += (data as { token: string }).token
            setStreamText(fullText)
          }
        }
      })

      if (sessionId) {
        const msgs = await api.get(`/chat/sessions/${sessionId}`, token ?? undefined) as Message[]
        setMessages(msgs)
        loadSessions()
      }
    } catch (err: unknown) {
      const errMsg: Message = {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        createdAt: new Date().toISOString()
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setStreaming(false)
      setStreamText('')
    }
  }

  async function handleReflect() {
    if (!currentSession || reflecting) return
    setReflecting(true)
    setReflectMsg('')
    try {
      const result = await api.post(`/memory/reflect/${currentSession.id}`, {}, token ?? undefined) as { stored?: number }
      setReflectMsg(result.stored ? `✦ ${result.stored} memories saved` : '✦ Nothing new')
      setTimeout(() => setReflectMsg(''), 4000)
    } catch (err: unknown) {
      setReflectMsg(`Error: ${err instanceof Error ? err.message : 'failed'}`)
      setTimeout(() => setReflectMsg(''), 3000)
    } finally {
      setReflecting(false)
    }
  }

  function newChat() {
    setCurrentSession(null)
    setMessages([])
    setStreamText('')
    setShowSessions(false)
  }

  const allMessages = streamText
    ? [...messages, { role: 'assistant' as const, content: streamText + '▍', createdAt: new Date().toISOString() }]
    : messages

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#030712' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
        <TouchableOpacity onPress={() => setShowSessions(true)} style={{ flex: 1 }}>
          <Text style={{ color: '#9ca3af', fontSize: 13 }} numberOfLines={1}>
            {currentSession ? currentSession.title : 'New chat'}
          </Text>
        </TouchableOpacity>
        {currentSession && messages.length >= 2 && !streaming && (
          <TouchableOpacity onPress={handleReflect} disabled={reflecting} style={{ marginRight: 12 }}>
            <Text style={{ color: reflecting ? '#4b5563' : '#6b7280', fontSize: 12 }}>
              {reflecting ? '…' : '✦ Reflect'}
            </Text>
          </TouchableOpacity>
        )}
        {reflectMsg ? <Text style={{ color: '#34d399', fontSize: 11, marginRight: 8 }}>{reflectMsg}</Text> : null}
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={allMessages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        ListEmptyComponent={
          !streaming ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>⚡</Text>
              <Text style={{ color: '#6b7280', fontSize: 16, fontWeight: '600' }}>Kiaros is ready</Text>
              <Text style={{ color: '#4b5563', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                Ask anything or give a task to complete.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={{
            alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            marginBottom: 12,
            backgroundColor: item.role === 'user' ? '#1d4ed8' : '#1f2937',
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: item.role === 'user' ? '#2563eb' : '#374151'
          }}>
            {item.role === 'assistant' && (
              <Text style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>Kiaros</Text>
            )}
            <Text style={{ color: '#ffffff', fontSize: 14, lineHeight: 20 }}>{item.content}</Text>
          </View>
        )}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      {streaming && !streamText && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={{ alignSelf: 'flex-start', backgroundColor: '#1f2937', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#374151' }}>
            <Text style={{ color: '#6b7280', fontSize: 14 }}>Thinking…</Text>
          </View>
        </View>
      )}

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderTopColor: '#1f2937', gap: 8 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Message Kiaros…"
            placeholderTextColor="#4b5563"
            multiline
            editable={!streaming}
            style={{
              flex: 1,
              backgroundColor: '#1f2937',
              borderWidth: 1,
              borderColor: '#374151',
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 10,
              color: '#ffffff',
              fontSize: 14,
              maxHeight: 120
            }}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={streaming || !input.trim()}
            style={{
              backgroundColor: '#2563eb',
              opacity: streaming || !input.trim() ? 0.5 : 1,
              width: 40, height: 40,
              borderRadius: 20,
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            {streaming
              ? <ActivityIndicator color="#ffffff" size="small" />
              : <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Sessions modal */}
      <Modal visible={showSessions} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSessions(false)}>
        <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
            <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700', flex: 1 }}>Sessions</Text>
            <TouchableOpacity onPress={() => setShowSessions(false)}>
              <Text style={{ color: '#6b7280', fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={newChat}
            style={{ margin: 16, backgroundColor: '#2563eb', borderRadius: 10, padding: 12, alignItems: 'center' }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '600' }}>+ New Chat</Text>
          </TouchableOpacity>

          <ScrollView>
            {sessions.map(s => (
              <TouchableOpacity
                key={s.id}
                onPress={() => loadSession(s)}
                style={{
                  paddingHorizontal: 16, paddingVertical: 14,
                  borderBottomWidth: 1, borderBottomColor: '#1e293b',
                  backgroundColor: s.id === currentSession?.id ? '#1e293b' : 'transparent'
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 14 }} numberOfLines={1}>{s.title}</Text>
                <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>{relativeTime(s.last_active_at)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

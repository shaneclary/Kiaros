import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native'
import { router } from 'expo-router'
import { getServerUrl, setServerUrl, clearAll, getToken } from '../lib/store'
import { api } from '../lib/api'

export default function SettingsScreen() {
  const [serverInput, setServerInput] = useState('')
  const [saving, setSaving]           = useState(false)
  const [saveMsg, setSaveMsg]         = useState('')
  const [isLoggedIn, setIsLoggedIn]   = useState(false)
  const [loading, setLoading]         = useState(true)

  // Model + API key settings (read-only display — edit on desktop)
  const [modelInfo, setModelInfo]     = useState<{ model?: string; label?: string } | null>(null)

  useEffect(() => {
    async function load() {
      const [url, token] = await Promise.all([getServerUrl(), getToken()])
      setServerInput(url ?? '')
      setIsLoggedIn(!!token)
      if (url && token) {
        try {
          const creds = await api.get('/credentials') as Array<{ label: string; model: string; is_active: number }>
          const active = creds.find(c => c.is_active)
          if (active) setModelInfo({ model: active.model, label: active.label })
        } catch {}
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSaveServer() {
    const url = serverInput.trim().replace(/\/$/, '')
    if (!url) return
    setSaving(true)
    setSaveMsg('')
    try {
      // Validate the URL by pinging /api/auth/status
      const res = await fetch(`${url}/api/auth/status`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      await setServerUrl(url)
      setSaveMsg('Server URL saved ✓')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (err: unknown) {
      setSaveMsg(`Cannot reach server: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    Alert.alert('Log out', 'This will clear your session token. You will need to enter your passphrase again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out', style: 'destructive',
        onPress: async () => {
          try { await api.post('/auth/logout', {}) } catch {}
          await clearAll()
          router.replace('/login')
        }
      }
    ])
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#030712', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#030712' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 28 }}>
          {isLoggedIn && (
            <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
              <Text style={{ color: '#3b82f6', fontSize: 16 }}>← Back</Text>
            </TouchableOpacity>
          )}
          <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700' }}>Settings</Text>
        </View>

        {/* Server URL */}
        <Section title="Server">
          <Text style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>
            Enter the URL of your Kiaros server. Use the LAN IP or Tailscale hostname.
          </Text>
          <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Server URL</Text>
          <TextInput
            value={serverInput}
            onChangeText={setServerInput}
            placeholder="http://192.168.1.42:3333"
            placeholderTextColor="#4b5563"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={{
              backgroundColor: '#1f2937',
              borderWidth: 1,
              borderColor: '#374151',
              borderRadius: 8,
              padding: 12,
              color: '#ffffff',
              fontSize: 14,
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              marginBottom: 12
            }}
          />
          <TouchableOpacity
            onPress={handleSaveServer}
            disabled={saving || !serverInput.trim()}
            style={{
              backgroundColor: '#2563eb',
              opacity: saving || !serverInput.trim() ? 0.6 : 1,
              borderRadius: 8,
              padding: 11,
              alignItems: 'center',
              marginBottom: saveMsg ? 8 : 0
            }}
          >
            {saving
              ? <ActivityIndicator color="#ffffff" size="small" />
              : <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 14 }}>Test & Save</Text>
            }
          </TouchableOpacity>
          {saveMsg ? (
            <Text style={{ color: saveMsg.startsWith('Cannot') ? '#f87171' : '#34d399', fontSize: 13, marginTop: 8 }}>
              {saveMsg}
            </Text>
          ) : null}
        </Section>

        {/* Active credential info */}
        {modelInfo && (
          <Section title="Active model">
            <Row label="Credential" value={modelInfo.label ?? '—'} />
            <Row label="Model" value={modelInfo.model ?? '—'} mono />
            <Text style={{ color: '#4b5563', fontSize: 12, marginTop: 8 }}>
              Manage API keys and budgets on the desktop app.
            </Text>
          </Section>
        )}

        {/* Account */}
        {isLoggedIn && (
          <Section title="Account">
            <TouchableOpacity
              onPress={handleLogout}
              style={{
                backgroundColor: '#7f1d1d',
                borderRadius: 8,
                padding: 11,
                alignItems: 'center'
              }}
            >
              <Text style={{ color: '#fca5a5', fontWeight: '600', fontSize: 14 }}>Log out</Text>
            </TouchableOpacity>
          </Section>
        )}

        {/* App info */}
        <Section title="About">
          <Row label="Version" value="1.0.0" />
          <Row label="Platform" value={Platform.OS} />
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 28 }}>
      <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
        {title}
      </Text>
      <View style={{ backgroundColor: '#111827', borderRadius: 12, padding: 16 }}>
        {children}
      </View>
    </View>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }}>
      <Text style={{ color: '#9ca3af', fontSize: 14 }}>{label}</Text>
      <Text style={{ color: '#ffffff', fontSize: 14, fontFamily: mono ? (Platform.OS === 'ios' ? 'Menlo' : 'monospace') : undefined }}>
        {value}
      </Text>
    </View>
  )
}

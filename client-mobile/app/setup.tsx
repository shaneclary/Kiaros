import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView
} from 'react-native'
import { router } from 'expo-router'
import { api } from '../lib/api'
import { setToken } from '../lib/store'

export default function SetupScreen() {
  const [passphrase, setPassphrase]   = useState('')
  const [confirm, setConfirm]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  async function handleSetup() {
    const p = passphrase.trim()
    if (!p) return setError('Passphrase is required')
    if (p.length < 8) return setError('Passphrase must be at least 8 characters')
    if (p !== confirm.trim()) return setError('Passphrases do not match')

    setLoading(true)
    setError('')
    try {
      // Create passphrase
      await api.post('/auth/setup', { passphrase: p })
      // Then log in to get token
      const data = await api.post('/auth/login', { passphrase: p }) as { token?: string }
      if (!data.token) throw new Error('Setup succeeded but login failed')
      await setToken(data.token)
      router.replace('/(tabs)/chat')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#030712' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 8 }}>⚡</Text>
        <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>
          Welcome to Kiaros
        </Text>
        <Text style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 8 }}>
          Set a passphrase to protect your agent.
        </Text>
        <Text style={{ color: '#4b5563', fontSize: 12, textAlign: 'center', marginBottom: 40 }}>
          This encrypts your API keys and sessions. Choose something strong — you cannot recover it.
        </Text>

        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Passphrase</Text>
        <TextInput
          value={passphrase}
          onChangeText={v => { setPassphrase(v); setError('') }}
          placeholder="Minimum 8 characters"
          placeholderTextColor="#4b5563"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            backgroundColor: '#1f2937',
            borderWidth: 1,
            borderColor: '#374151',
            borderRadius: 8,
            padding: 14,
            color: '#ffffff',
            fontSize: 15,
            marginBottom: 16
          }}
        />

        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Confirm passphrase</Text>
        <TextInput
          value={confirm}
          onChangeText={v => { setConfirm(v); setError('') }}
          placeholder="Re-enter passphrase"
          placeholderTextColor="#4b5563"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleSetup}
          returnKeyType="go"
          style={{
            backgroundColor: '#1f2937',
            borderWidth: 1,
            borderColor: '#374151',
            borderRadius: 8,
            padding: 14,
            color: '#ffffff',
            fontSize: 15,
            marginBottom: error ? 8 : 24
          }}
        />

        {error ? (
          <Text style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</Text>
        ) : null}

        <TouchableOpacity
          onPress={handleSetup}
          disabled={loading || !passphrase.trim() || !confirm.trim()}
          style={{
            backgroundColor: '#2563eb',
            opacity: loading || !passphrase.trim() || !confirm.trim() ? 0.6 : 1,
            borderRadius: 8,
            padding: 14,
            alignItems: 'center'
          }}
        >
          {loading
            ? <ActivityIndicator color="#ffffff" />
            : <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 15 }}>Create Kiaros</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

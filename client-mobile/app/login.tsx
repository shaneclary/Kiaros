import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native'
import { router } from 'expo-router'
import { api } from '../lib/api'
import { setToken, getServerUrl } from '../lib/store'

export default function LoginScreen() {
  const [passphrase, setPassphrase] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  async function handleLogin() {
    const p = passphrase.trim()
    if (!p) return
    setLoading(true)
    setError('')
    try {
      const data = await api.post('/auth/login', { passphrase: p }) as { token?: string }
      if (!data.token) throw new Error('No token received')
      await setToken(data.token)
      router.replace('/(tabs)/chat')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#030712' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32 }}>
        {/* Icon + title */}
        <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 8 }}>⚡</Text>
        <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>
          Kiaros
        </Text>
        <Text style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 40 }}>
          Your personal AI agent
        </Text>

        {/* Passphrase input */}
        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Passphrase</Text>
        <TextInput
          value={passphrase}
          onChangeText={setPassphrase}
          placeholder="Enter passphrase…"
          placeholderTextColor="#4b5563"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleLogin}
          returnKeyType="go"
          style={{
            backgroundColor: '#1f2937',
            borderWidth: 1,
            borderColor: '#374151',
            borderRadius: 8,
            padding: 14,
            color: '#ffffff',
            fontSize: 15,
            marginBottom: error ? 8 : 20
          }}
        />

        {error ? (
          <Text style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</Text>
        ) : null}

        {/* Login button */}
        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading || !passphrase.trim()}
          style={{
            backgroundColor: loading || !passphrase.trim() ? '#1d4ed8' : '#2563eb',
            opacity: loading || !passphrase.trim() ? 0.6 : 1,
            borderRadius: 8,
            padding: 14,
            alignItems: 'center',
            marginBottom: 16
          }}
        >
          {loading
            ? <ActivityIndicator color="#ffffff" />
            : <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 15 }}>Unlock</Text>
          }
        </TouchableOpacity>

        {/* Server settings link */}
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
            Change server URL
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

import { useEffect, useState, createContext, useContext } from 'react'
import { Stack, router } from 'expo-router'
import { View, ActivityIndicator, Platform } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import * as Notifications from 'expo-notifications'
import { getToken, getServerUrl, clearAll } from '../lib/store'
import { api } from '../lib/api'

// Configure how notifications are shown when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  })
})

SplashScreen.preventAutoHideAsync()

// --- Auth context shared by all screens ---

interface AuthCtx {
  token: string | null
  serverUrl: string | null
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthCtx>({
  token: null,
  serverUrl: null,
  signOut: async () => {},
  refresh: async () => {}
})

export function useAuth(): AuthCtx {
  return useContext(AuthContext)
}

// --- Push notification registration ---

async function registerPushToken(authToken: string): Promise<void> {
  // Physical device required (emulators don't have push)
  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') return

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('kiaros', {
      name: 'Kiaros',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3b82f6',
    })
  }

  const pushToken = await Notifications.getExpoPushTokenAsync()
  await api.post('/push/register', {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    token: pushToken.data,
    deviceName: Platform.OS
  }, authToken)
}

// --- Root layout ---

export default function RootLayout() {
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [firstRun, setFirstRun] = useState(false)

  async function loadAuth() {
    try {
      const [tok, srv] = await Promise.all([getToken(), getServerUrl()])
      setToken(tok)
      setServerUrl(srv)

      if (!srv) {
        // No server URL → send to settings to configure
        setReady(true)
        return
      }

      if (!tok) {
        // Server known but not logged in — check if first-run
        try {
          const status = await api.get('/auth/status') as { hasPassphrase: boolean }
          setFirstRun(!status.hasPassphrase)
        } catch {
          setFirstRun(false)
        }
      }
    } finally {
      setReady(true)
      SplashScreen.hideAsync()
    }
  }

  useEffect(() => { loadAuth() }, [])

  useEffect(() => {
    if (!ready) return
    if (!serverUrl) {
      router.replace('/settings')
    } else if (!token) {
      router.replace(firstRun ? '/setup' : '/login')
    } else {
      router.replace('/(tabs)/chat')
      // Register for push notifications after authentication
      registerPushToken(token).catch(() => {})
    }
  }, [ready, token, serverUrl, firstRun])

  async function signOut() {
    try { await api.post('/auth/logout', {}) } catch {}
    await clearAll()
    setToken(null)
    router.replace('/login')
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#030712', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    )
  }

  return (
    <AuthContext.Provider value={{ token, serverUrl, signOut, refresh: loadAuth }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#030712' } }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </AuthContext.Provider>
  )
}

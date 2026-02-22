import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'kiaros_token'
const SERVER_KEY = 'kiaros_server_url'
const DEVICE_KEY = 'kiaros_device_name'

// --- Auth token ---

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export async function setToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(TOKEN_KEY, token)
}

export async function clearToken(): Promise<void> {
  return SecureStore.deleteItemAsync(TOKEN_KEY)
}

// --- Server URL ---
// Example: "http://192.168.1.42:3333" or "https://kiaros.my-tailnet.ts.net"

export async function getServerUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(SERVER_KEY)
}

export async function setServerUrl(url: string): Promise<void> {
  // Strip trailing slash
  const clean = url.replace(/\/$/, '')
  return SecureStore.setItemAsync(SERVER_KEY, clean)
}

export async function clearServerUrl(): Promise<void> {
  return SecureStore.deleteItemAsync(SERVER_KEY)
}

// --- Device name (for push registration) ---

export async function getDeviceName(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_KEY)
}

export async function setDeviceName(name: string): Promise<void> {
  return SecureStore.setItemAsync(DEVICE_KEY, name)
}

// --- Clear all (logout) ---

export async function clearAll(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    // Keep SERVER_KEY — user should not have to re-enter server URL after logout
  ])
}

import { getServerUrl, getToken } from './store'

// --- Base request ---

async function request(
  method: string,
  path: string,
  body?: unknown,
  overrideToken?: string
): Promise<unknown> {
  const serverUrl = await getServerUrl()
  if (!serverUrl) throw new Error('Server URL not configured. Go to Settings.')

  const token = overrideToken ?? (await getToken())

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${serverUrl}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      const j = await res.json() as { error?: string }
      if (j.error) errMsg = j.error
    } catch {}
    throw new Error(errMsg)
  }

  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// --- Convenience methods ---

export const api = {
  get:    (path: string, token?: string) => request('GET',    path, undefined, token),
  post:   (path: string, body: unknown, token?: string) => request('POST',   path, body, token),
  put:    (path: string, body: unknown, token?: string) => request('PUT',    path, body, token),
  delete: (path: string, token?: string) => request('DELETE', path, undefined, token),

  // Raw — returns Response for streaming (SSE)
  async stream(path: string, body: unknown, token?: string): Promise<Response> {
    const serverUrl = await getServerUrl()
    if (!serverUrl) throw new Error('Server URL not configured.')
    const tok = token ?? (await getToken())
    return fetch(`${serverUrl}/api${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      },
      body: JSON.stringify(body),
    })
  }
}

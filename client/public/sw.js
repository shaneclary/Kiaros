// Kiaros service worker — cache-first for app shell, network-first for API
const CACHE = 'kiaros-v1'
const SHELL = [
  '/',
  '/chat',
  '/tools',
  '/memory',
  '/scheduler',
  '/documents',
  '/search',
  '/audit',
  '/settings',
]

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL).catch(() => {}))
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Always hit network for API calls and SSE streams
  if (url.pathname.startsWith('/api/')) return

  // Cache-first for everything else (static assets + SPA routes)
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response.ok && response.type === 'basic') {
            caches.open(CACHE).then(c => c.put(request, response.clone()))
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    })
  )
})

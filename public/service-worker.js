// Versionamento: Muda automaticamente para forçar novo cache
const BUILD_VERSION = '20260818-002'
const CACHE_NAME = `inspec360-v2-cache-${BUILD_VERSION}`

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
]

// Install - cache static assets
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing version ${BUILD_VERSION}`)
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache essential files, ignore errors for missing files
      return Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch(() => console.log(`Could not cache ${url}`))
        )
      )
    })
  )
  self.skipWaiting()
})

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim()
})

// Fetch - Network first for API, cache first for assets
//
// A sincronização de mutações offline (fila/outbox) é feita pela própria
// aba, em src/sync/engine.ts, disparada pelo evento 'online' do navegador —
// não depende da Background Sync API (sem suporte no Safari/iOS, comum em
// tablets de campo). O service worker cuida só do cache: deixar o "esqueleto"
// do app abrir mesmo sem sinal, e responder chamadas de API já vistas com a
// última resposta conhecida enquanto não há rede.
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // API requests - Network first, fallback to stale cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && request.method === 'GET') {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached
            return new Response(JSON.stringify({ offline: true }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            })
          })
        })
    )
  }
  // Static assets - Cache first
  else if (
    request.method === 'GET' &&
    (url.pathname.match(/\.(js|css|png|jpg|svg|woff|woff2)$/) ||
      url.pathname.includes('/assets/'))
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
      })
    )
  }
  // HTML - Network first
  else if (request.method === 'GET' && url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone)
          })
          return response
        })
        .catch(() => caches.match(request))
    )
  }
})

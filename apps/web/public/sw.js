const CACHE_PREFIX = 'light-weight';
const SHELL_CACHE = 'light-weight-shell-v2';
const ASSETS_CACHE = 'light-weight-assets-v2';
const CURRENT_CACHES = [SHELL_CACHE, ASSETS_CACHE];

const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/brand/app-icon.svg',
  '/brand/icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.includes(key)) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 1. API bypass: never intercept /api/*
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. Cross-origin bypass: ignore Google Identity Services and external auth
  if (url.origin !== self.location.origin) {
    return;
  }

  // 3. Navigation / HTML requests: NETWORK FIRST
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseCopy = networkResponse.clone();
            caches.open(SHELL_CACHE).then((cache) => {
              cache.put('/', responseCopy);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedShell = await caches.match('/');
          if (cachedShell) {
            return cachedShell;
          }
          return new Response('Offline - Light Weight', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  // 4. Content-hashed assets from Vite (/assets/*): CACHE FIRST
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseCopy = networkResponse.clone();
            caches.open(ASSETS_CACHE).then((cache) => {
              cache.put(request, responseCopy);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 5. Unhashed static assets (/brand/*, /manifest.webmanifest, etc.): STALE-WHILE-REVALIDATE
  event.respondWith(
    caches.open(ASSETS_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => null);

      return cached || (await networkFetch);
    })
  );
});

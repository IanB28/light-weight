const CACHE_PREFIX = 'light-weight';
const SHELL_CACHE = 'light-weight-shell-v2';
const ASSETS_CACHE = 'light-weight-assets-v2';
const CURRENT_CACHES = [SHELL_CACHE, ASSETS_CACHE];

const PRECACHE_STATIC_URLS = [
  '/',
  '/manifest.webmanifest',
  '/brand/icon-192.png',
  '/brand/apple-touch-icon-180.png'
];

/**
 * Extracts same-origin /assets/* URLs from raw index HTML string.
 * Strictly avoids /api/*, external schemes, or protocol-relative paths.
 */
function extractAssetUrlsFromHtml(html) {
  const urls = new Set();
  const assetRegex = /(?:src|href)=["'](\/assets\/[^"']+)["']/g;
  let match;
  while ((match = assetRegex.exec(html)) !== null) {
    const rawPath = match[1];
    if (
      rawPath.startsWith('/assets/') &&
      !rawPath.includes('://') &&
      !rawPath.startsWith('//') &&
      !rawPath.startsWith('/api/')
    ) {
      urls.add(rawPath);
    }
  }
  return Array.from(urls);
}

/**
 * Precaches core shell and dynamically discovers Vite hashed assets from index HTML.
 * Bypasses HTTP cache to guarantee fresh assets in Cache Storage.
 */
async function precacheShellAndAssets() {
  const shellCache = await caches.open(SHELL_CACHE);
  const assetsCache = await caches.open(ASSETS_CACHE);

  // 1. Precache known static shell assets
  await shellCache.addAll(PRECACHE_STATIC_URLS);

  // 2. Discover Vite content-hashed assets from index.html
  try {
    const htmlResponse = await fetch('/', { cache: 'no-cache' });
    if (htmlResponse && htmlResponse.ok) {
      const htmlText = await htmlResponse.clone().text();
      await shellCache.put('/', htmlResponse);

      const discoveredAssets = extractAssetUrlsFromHtml(htmlText);
      const dynamicChunks = new Set();

      // Scan entry scripts for relative chunk references (e.g. dynamic imports)
      for (const assetUrl of discoveredAssets) {
        if (assetUrl.endsWith('.js')) {
          try {
            const jsResponse = await fetch(assetUrl, { cache: 'no-cache' });
            if (jsResponse && jsResponse.ok) {
              await assetsCache.put(assetUrl, jsResponse.clone());
              const jsText = await jsResponse.text();
              const chunkMatches = jsText.matchAll(/["']\.\/([a-zA-Z0-9_-]+\.(?:js|css))["']/g);
              for (const m of chunkMatches) {
                dynamicChunks.add(`/assets/${m[1]}`);
              }
            }
          } catch {
            // Non-fatal if individual script discovery encounters an issue
          }
        }
      }

      const allAssets = Array.from(new Set([...discoveredAssets, ...dynamicChunks]));
      await Promise.allSettled(
        allAssets.map(async (assetUrl) => {
          try {
            const existing = await assetsCache.match(assetUrl);
            if (!existing) {
              const res = await fetch(assetUrl, { cache: 'no-cache' });
              if (res && res.ok && res.type === 'basic') {
                await assetsCache.put(assetUrl, res);
              }
            }
          } catch {
            // Non-fatal
          }
        })
      );
    }
  } catch (error) {
    // If dynamic discovery fails, static precache ensures SW is not broken
    console.warn('[SW] Dynamic asset discovery during install skipped:', error);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShellAndAssets());
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

  // 3. Navigation / HTML requests: NETWORK FIRST with offline fallback
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
        }).catch(() => {
          return new Response('', { status: 504, statusText: 'Gateway Timeout' });
        });
      })
    );
    return;
  }

  // 5. Unhashed static assets (/brand/*, /manifest.webmanifest, etc.): STALE-WHILE-REVALIDATE
  // Guarantees response never resolves to null
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

      const response = cached || (await networkFetch);
      if (response) {
        return response;
      }
      return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    })
  );
});

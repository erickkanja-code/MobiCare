// MobiCare Service Worker — Workbox-style offline caching

const CACHE_NAME = "mobicare-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/static/js/main.chunk.js",
  "/static/js/bundle.js",
  "/manifest.json",
];

// Install — precache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first for static, network-first for API
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls — network first, don't cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ error: "Offline" }), {
        headers: { "Content-Type": "application/json" },
        status: 503,
      }))
    );
    return;
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match("/index.html")); // SPA fallback
    })
  );
});

// Background sync (for queued offline changes)
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-mobicare") {
    event.waitUntil(syncPendingChanges());
  }
});

async function syncPendingChanges() {
  // Notify all clients to run sync
  const clients = await self.clients.matchAll();
  clients.forEach((client) => client.postMessage({ type: "TRIGGER_SYNC" }));
}

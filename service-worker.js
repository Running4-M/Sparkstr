// frontend/service-worker.js
const CACHE_NAME = "catalyst-pwa-v1";
const ASSETS = [
  "./manifest.webmanifest",
  "./Login/signup.html",
  "./Login/login.html",
  "./Calendar/Calendar.html",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // addAll will reject if any asset is missing; catch to avoid the SW install being stuck in dev.
      return cache.addAll(ASSETS).catch(err => {
        console.warn("SW cache.addAll failed (some assets may be missing):", err);
        return Promise.resolve();
      });
    })
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Navigation / app-shell fallback
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(event.request);
      } catch (err) {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match("./Login/signup.html") || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // Cache-first then network
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    const networkPromise = fetch(event.request).then(res => {
      if (res && res.ok) {
        // put into cache but ignore failures (e.g., opaque responses)
        cache.put(event.request, res.clone()).catch(() => {});
      }
      return res;
    }).catch(() => null);
    return cached || (await networkPromise) || new Response(null, { status: 404 });
  })());
});

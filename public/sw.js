// Lenore app shell cache. Never caches API responses, so signed-in data and
// revoked access are always decided by the server.
const CACHE = "lenore-shell-v4";
const SHELL = ["/catalogue", "/manage", "/pos", "/manifest.webmanifest", "/manage.webmanifest", "/pos.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  // Hashed build assets, fonts and icons never change: cache first.
  if (/^\/(assets|fonts|icons|images)\//.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((response) => {
            if (response.ok) caches.open(CACHE).then((c) => c.put(event.request, response.clone()));
            return response;
          }),
      ),
    );
    return;
  }
  // App navigations: network first, cached shell when offline.
  // Each installed app (catalogue, admin, billing) keeps its own offline shell.
  const app = /^\/(catalogue|manage|pos)/.exec(url.pathname)?.[1];
  if (event.request.mode === "navigate" && app) {
    const key = `/${app}`;
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((c) => c.put(key, response.clone()));
          return response;
        })
        .catch(() => caches.match(key)),
    );
  }
});

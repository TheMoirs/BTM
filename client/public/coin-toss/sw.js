// Keeps a copy of Score Flip (coin flip + score keeper) on the device so it works without an internet connection.
// Only covers /coin-toss/; the rest of BTM is unaffected.
const CACHE = "btm-coin-toss-v7";
const FILES = [
  "/coin-toss/",
  "/coin-toss/index.html",
  "/coin-toss/coin-art.js",
  "/coin-toss/score.js",
  "/coin-toss/score.css",
  "/coin-toss/manifest.webmanifest",
  "/coin-toss/logo.png",
  "/coin-toss/favicon.png",
  "/coin-toss/icon-192.png",
  "/coin-toss/icon-512.png",
  "/coin-toss/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("btm-coin-toss-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Serve from the device straight away; refresh the copy in the background when online
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/coin-toss/")) return;
  const key = url.origin + (url.pathname === "/coin-toss/index.html" ? "/coin-toss/" : url.pathname);

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key);
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === "basic") cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(fresh.then(() => undefined));
        return cached;
      }
      return fresh;
    }),
  );
});

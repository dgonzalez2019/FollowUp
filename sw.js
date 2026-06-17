/* This service worker is intentionally inert. The app no longer uses offline
   caching (it caused stale "white screen" loads). On install it takes over and
   clears all old caches, then unregisters itself, healing any device that still
   has an old worker. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) { return caches.delete(n); }));
    }).then(function () {
      return self.registration.unregister();
    }).then(function () {
      return self.clients.matchAll();
    }).then(function (clients) {
      clients.forEach(function (c) { c.navigate(c.url); });
    })
  );
});
/* Never intercept fetches — always go straight to the network. */

const V = "showroom-v2", SHELL = ["/static/css/styles.css", "/static/js/app.js", "/static/js/i18n.js", "/static/js/admin.js", "/static/icons/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.startsWith("/static/") || u.pathname.startsWith("/media/")) {   // cache-first
    e.respondWith(caches.match(r).then(h => h || fetch(r).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); return res; })));
  } else if (u.pathname.startsWith("/api/") && !u.pathname.includes("/me") && !u.pathname.includes("/admin")) { // network-first
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); return res; }).catch(() => caches.match(r)));
  } else if (r.mode === "navigate") {   // app shell: network, fall back to cached shell
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(x => x.put("/shell", c)); return res; }).catch(() => caches.match("/shell")));
  }
});

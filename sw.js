const CACHE = 'kucun-v2.1.0-20260723';
const SHELL = ['./','./index.html','./styles.css','./app.js','./manifest.json','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (/script\.google(usercontent)?\.com/.test(url.host)) return;
  if (url.origin !== location.origin) return;
  const navigation = event.request.mode === 'navigate';
  event.respondWith(
    (navigation ? fetch(event.request) : caches.match(event.request).then(hit => hit || fetch(event.request)))
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(navigation ? './index.html' : event.request))
  );
});

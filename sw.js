/* 我的庫存櫃 — Service Worker
   快取 App 外殼,讓它能安裝到主畫面並離線開啟。
   改版時把 CACHE 的版本號 +1,使用者下次開啟就會拿到新版。 */
const CACHE = 'kucun-v2';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 只快取 GET
  if (e.request.method !== 'GET') return;
  // 呼叫 Google Apps Script 的同步請求一律走網路,不要被快取攔截
  if (/script\.google(usercontent)?\.com/.test(url.host)) return;

  // App 外殼:cache-first,離線也能開
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        if (hit) return hit;
        return fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        }).catch(() => caches.match('./index.html'));
      })
    );
  }
});

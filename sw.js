// sw.js — keeps a copy of the app on your phone so it opens instantly and works offline.
// When you publish an update, change VERSION so phones download the new files.

const VERSION = 'momentum-v1.0.1';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/main.js',
  'js/store.js',
  'js/logic.js',
  'js/ui.js',
  'js/util.js',
  'js/icons.js',
  'js/ics.js',
  'js/charts.js',
  'js/views/today.js',
  'js/views/train.js',
  'js/views/food.js',
  'js/views/goals.js',
  'js/views/progress.js',
  'js/views/settings.js',
  'vendor/html5-qrcode.min.js',
  'fonts/pjs-500.woff2',
  'fonts/pjs-600.woff2',
  'fonts/pjs-700.woff2',
  'fonts/pjs-800.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only handle the app's own files. Food lookups always go to the internet.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match('index.html'))),
  );
});

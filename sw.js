/* Service worker: lưu toàn bộ app để chạy offline. Đổi VERSION mỗi lần cập nhật. */
const VERSION = 'cma-v1.3.6';
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'lib/xlsx.mini.min.js', 'data/public.json', 'data/CMA_data_public.xlsx',
  'icons/icon-192.png', 'icons/icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});

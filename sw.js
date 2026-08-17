/* Офлайн-кэш. Меняй CACHE при обновлении файлов. */
const CACHE = 'mt3d-v10';
const FILES = ['./', './index.html', './style.css', './data.js', './sim.js', './audio.js',
  './models.js', './scene.js', './ui.js', './main.js', './vendor/three.min.js',
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png',
  './assets/grass.jpg', './assets/soil.jpg', './assets/floor.jpg',
  './assets/concrete.jpg', './assets/sky.jpg', './assets/loading.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});
// Сеть впереди кэша: обновления приезжают сразу, офлайн работает из кэша.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const fresh = /\.(?:js|css|html)(?:\?|$)/.test(e.request.url) || e.request.mode === 'navigate';
  e.respondWith(
    fetch(fresh ? new Request(e.request, { cache: 'reload' }) : e.request)
      .then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

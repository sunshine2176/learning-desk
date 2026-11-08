/* sw.js — 离线缓存。改了页面内容想立刻生效，把 VERSION 加一即可。 */
const VERSION = 'v15';
const CACHE = 'desk-' + VERSION;
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './dict.js',
  './pinyin.js',
  './english.js',
  './audio/index.js',
  './local.js',
  './app.js',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });

    const net = fetch(req).then(res => {
      if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);

    if (cached) { net.catch(() => {}); return cached; }   // 先给缓存，后台更新
    const r = await net;
    if (r) return r;
    return (await cache.match('./index.html')) || new Response('离线且无缓存', { status: 503 });
  })());
});

// Service worker de la PWA: deja instalar el juego y jugarlo sin conexion.
//
// "vite build" (plugin ilogic-pwa de vite.config.ts) cambia la linea de BUILD por la version real:
// un hash del contenido y la lista de ficheros a guardar al instalar. Cada publicacion trae un
// service worker distinto, asi que el navegador lo instala, guarda los ficheros nuevos y borra
// los de la version anterior. En "npm run dev" no se registra (src/pwa.ts).
//
// - Ficheros con hash en el nombre (assets/index-AbC123xy.js): nunca cambian → primero la cache.
// - Todo lo demas (index.html, atlas, musica, iconos): primero la red, y la cache si no hay
//   conexion. Asi una version nueva nunca mezcla su codigo con graficos viejos.
// - Peticiones a otros sitios (notas de parche de GitHub) y a las previews de las PR
//   (preview/<hash>/, que tienen su propio service worker) no se tocan.
const BUILD = {"version":"c9ce8cfd072e","precache":["./","assets/atlas/atlas-0.json","assets/atlas/atlas-0.png","assets/atlas/atlas-1.json","assets/atlas/atlas-1.png","assets/ilogic-CbWqDDSn.woff2","assets/img/raton.png","assets/img/raton_boton.png","assets/index-6n5XvShO.css","assets/index-DxIZBJwt.js","assets/pixelify-sans-latin-400-normal-DLrIX9QE.woff2","assets/silkscreen-latin-400-normal-CtPo2yA5.woff2","icons/apple-touch-icon.png","icons/favicon-32.png","icons/favicon-64.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-192.png","icons/maskable-512.png","index.html","manifest.webmanifest"]};

const PREFIX = 'ilogic-';
const CACHE = PREFIX + BUILD.version;
const IMMUTABLE = /\/assets\/[^/]+-[\w-]{8}\.\w+$/;
const scope = self.registration.scope;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(BUILD.precache.map((p) => new URL(p, scope).href)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = req.url.split('#')[0];
  if (!url.startsWith(scope) || url.slice(scope.length).startsWith('preview/')) return;

  if (req.mode === 'navigate') event.respondWith(networkFirst(req, new URL('index.html', scope).href));
  else if (IMMUTABLE.test(new URL(url).pathname)) event.respondWith(cacheFirst(req));
  else event.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, fallback) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(fallback ?? req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req, { ignoreSearch: true })) ?? (fallback && (await cache.match(fallback)));
    if (hit) return hit;
    throw err;
  }
}

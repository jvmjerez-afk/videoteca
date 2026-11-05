// Videoteca: service worker (versión 031)
// Arranque rápido: la app se abre al instante desde la copia guardada en el móvil
// y, mientras tanto, se descarga por detrás la versión de GitHub. Si ha cambiado,
// la app avisa con «Hay una versión nueva» para recargarla.
// Las peticiones a la API de YouTube y a noembed nunca se guardan.
const VERSION = 'videoteca-v031';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'i.ytimg.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('videoteca-') && k !== VERSION && k !== VERSION + '-rt').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function notifyUpdate() {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  list.forEach(c => c.postMessage({ type: 'update' }));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La propia app: copia guardada al instante y actualización por detrás.
  // Se pide con una dirección única para saltarse la caché de GitHub (hasta 10 minutos)
  // y nunca se sustituye la copia guardada por una versión más antigua.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match('./index.html');
      const verOf = t => Number((String(t).match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
      const net = fetch('./index.html?sw=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' }).then(async res => {
        if (!res || !res.ok) return null;
        const fresh = await res.text();
        const old = cached ? await cached.clone().text() : null;
        if (old === null || verOf(fresh) >= verOf(old)) {
          await cache.put('./index.html', new Response(fresh, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
        }
        if (old !== null && verOf(fresh) > verOf(old)) await notifyUpdate();
        return new Response(fresh, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }).catch(() => null);
      if (cached) { event.waitUntil(net); return cached; }
      return (await net) || new Response('<h1>Sin conexión</h1>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    })());
    return;
  }

  // Archivos de la app (manifiesto, iconos)
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }

  // Tipografías y miniaturas: copia guardada al instante y se actualiza por detrás
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(VERSION + '-rt').then(cache =>
        cache.match(req).then(cached => {
          const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => cached);
          return cached || net;
        })
      )
    );
  }
});

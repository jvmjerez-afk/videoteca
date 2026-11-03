// Videoteca: service worker (versión 023)
// - La app (index.html) se pide primero a internet, para recibir siempre la última versión;
//   sin conexión se usa la copia guardada.
// - Tipografías, Tailwind y miniaturas se guardan para que la app abra rápido y sin conexión.
// - Las peticiones a la API de YouTube y a noembed nunca se guardan.
const VERSION = 'videoteca-v023';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const RUNTIME_HOSTS = ['cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'i.ytimg.com'];

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

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La propia app: primero internet, si falla la copia guardada
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); }
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Archivos de la app (manifiesto, iconos)
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }

  // Tipografías, Tailwind y miniaturas: copia guardada al instante y se actualiza por detrás
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
  // Todo lo demás (API de YouTube, noembed…) va directo a internet
});

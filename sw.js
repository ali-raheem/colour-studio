/*
 * Service worker: precaches the whole app so it works fully offline.
 *
 * IMPORTANT: run `python3 scripts/build_version.py` before every deploy. Files are
 * served cache-first, so an unchanged VERSION means returning users keep the old
 * copy; that script stamps VERSION below from a hash of the tracked files, so it
 * always changes exactly when a deploy needs it to. (tests/sw.test.js checks the
 * ASSETS list matches what index.html loads.)
 */
const VERSION = 'v43cf5f5878';
const CACHE = `colour-studio-${VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'style.css',
  'js/color.js',
  'js/names.js',
  'js/palettes.js',
  'js/version.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // cache:'reload' bypasses the HTTP cache so a new version never precaches stale files.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('colour-studio-') && k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// The page asks for this when the user accepts "Update available".
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).catch(() =>
          req.mode === 'navigate' ? caches.match('index.html') : Response.error()
        )
    )
  );
});

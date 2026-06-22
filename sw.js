/* ToxiGuard — Service Worker
 * Offline-first pour une app monopage. Stratégie :
 *  - navigations (HTML) : réseau d'abord, repli sur le cache (les mises à jour Vercel apparaissent vite)
 *  - autres ressources même origine : cache d'abord, repli réseau
 *  - cross-origin : réseau direct (pas de mise en cache des réponses opaques)
 * Incrémenter CACHE_VERSION à chaque déploiement force le rafraîchissement du cache.
 */
const CACHE_VERSION = 'toxiguard-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

// Install résilient : on met en cache chaque ressource indépendamment.
// Si l'une échoue (404, réseau), l'installation du SW réussit quand même
// — Chrome peut donc toujours proposer l'installation de l'app.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.allSettled(CORE_ASSETS.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Permet au bouton "Nouvelle version disponible" d'activer le SW en attente.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin : laisser passer

  // Navigations : réseau d'abord
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Autres ressources : cache d'abord
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});

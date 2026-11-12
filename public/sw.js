// Service worker da Arco: só cuida dos avisos no celular.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function homeUrl() {
  try {
    const cache = await caches.open('arco-push');
    const r = await cache.match('/__arco_home');
    if (r) return await r.text();
  } catch (e) {}
  return '/';
}

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'home' && typeof e.data.url === 'string' && e.data.url.startsWith('/')) {
    e.waitUntil(caches.open('arco-push').then((c) => c.put('/__arco_home', new Response(e.data.url))));
  }
});

self.addEventListener('push', (e) => {
  e.waitUntil(
    self.registration.showNotification('Arco Contents', {
      body: 'Tem conteúdo novo esperando a sua aprovação.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'arco-novo',
      renotify: true
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    (async () => {
      const url = await homeUrl();
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          await c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});

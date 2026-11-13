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

function readPush(e) {
  try {
    const d = e.data ? e.data.json() : null;
    if (d && typeof d.url === 'string' && d.url.startsWith('/') && !d.url.startsWith('//')) return d;
  } catch (err) {}
  return null;
}

self.addEventListener('push', (e) => {
  const d = readPush(e);
  e.waitUntil(
    self.registration.showNotification(d ? String(d.title).slice(0, 80) : 'Arco Contents', {
      body: d ? String(d.body).slice(0, 200) : 'Tem conteúdo novo esperando a sua aprovação.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d && d.tag ? String(d.tag).slice(0, 40) : 'arco-novo',
      renotify: true,
      data: { url: d ? d.url : null }
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const direct = e.notification.data && e.notification.data.url;
  e.waitUntil(
    (async () => {
      const url = direct || (await homeUrl());
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

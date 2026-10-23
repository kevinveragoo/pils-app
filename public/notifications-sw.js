// Elisa Kevin Veragoo + ChatGPT
/* Notifications only: never cache patient pages or API responses. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(payload.title || 'PILS', {
    body: payload.body || '', tag: payload.tag || 'pils', icon: '/notification-icon-192.png',
    data: { url: payload.tag === 'pils-test' ? '/notifications' : '/clinic-queue' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url === '/notifications' ? '/notifications' : '/clinic-queue', self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});

//
//  notifications-sw.js
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
/* Notifications only: never cache patient pages or API responses. */
function notificationUrl(value) {
  if (['/notifications', '/clinic-queue'].includes(value)) return value;
  if (typeof value === 'string' && /^\/logs\/details\/app%3A[a-zA-Z0-9_-]+\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return '/notifications';
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(payload.title || 'PILS', {
    body: payload.body || '', tag: payload.tag || 'pils', icon: '/notification-icon-192.png',
    data: { url: payload.tag === 'pils-test' ? '/notifications' : notificationUrl(payload.url) },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(notificationUrl(event.notification.data?.url), self.location.origin).href;
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

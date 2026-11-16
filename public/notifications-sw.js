//
//  notifications-sw.js
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
/* Notifications only: never cache patient pages or API responses. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(payload.title || 'PILS', {
    body: payload.body || '', tag: payload.tag || 'pils', icon: '/notification-icon-192.png',
    data: { url: notificationTarget(payload.tag === 'pils-test' ? '/notifications' : payload.url) },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(notificationTarget(event.notification.data?.url), self.location.origin).href;
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

function notificationTarget(value) {
  try {
    const url = new URL(value || '/clinic-queue', self.location.origin);
    if (url.origin === self.location.origin && ['/clinic-queue', '/notifications', '/outreach'].includes(url.pathname)) return url.pathname + url.search;
  } catch { /* Fall back to a protected page on this origin. */ }
  return '/clinic-queue';
}

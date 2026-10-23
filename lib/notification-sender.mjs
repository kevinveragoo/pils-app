// Elisa Kevin Veragoo + ChatGPT
import { createHash } from 'node:crypto';
import { canReceiveClinicArrivals, arrivalPayload } from './notification-policy.mjs';

// Saved queue events are the outbox. Ignore stale arrivals rather than alerting hours later.
export const ARRIVAL_MAX_AGE_MS = 10 * 60 * 1000;
export async function sendArrivalNotifications(db, send, now = new Date()) {
  const cutoff = new Date(now.getTime() - ARRIVAL_MAX_AGE_MS);
  const events = await db.clinicQueueEvent.findMany({
    where: { action: { in: ['ARRIVED', 'WALK_IN_CHECKED_IN'] }, createdAt: { gte: cutoff } },
    include: { entry: true }, orderBy: { createdAt: 'asc' },
  });
  for (const event of events) {
    if (event.entry.status === 'EXPECTED' || event.entry.status === 'DONE' || event.entry.status === 'CANCELLED' || event.entry.noShow) continue;
    const subscriptions = await db.pushSubscription.findMany({ where: { createdAt: { lte: event.createdAt } } });
    for (const subscription of subscriptions) {
      // Check at send time, including retries: roles, organisation, status, preferences and login.
      const user = await db.user.findUnique({ where: { id: subscription.userId }, include: { notificationPreference: true } });
      if (!user || !canReceiveClinicArrivals(user)) continue;
      const preference = user.notificationPreference;
      if (!preference?.enabled || !preference.clinicArrivals || preference.enabledAt > event.createdAt) continue;
      const session = await db.session.findFirst({ where: { id: subscription.sessionId, userId: user.id, expiresAt: { gt: now } } });
      if (!session) { await db.pushSubscription.deleteMany({ where: { id: subscription.id } }); continue; }
      const key = { queueEntryId: event.queueEntryId, subscriptionId: subscription.id };
      // Atomic claim also prevents two worker processes sending the same delivery concurrently.
      const delivery = await db.pushDelivery.upsert({ where: { queueEntryId_subscriptionId: key }, create: { ...key, nextAttemptAt: now }, update: {} });
      if (delivery.state !== 'PENDING' || delivery.nextAttemptAt > now) continue;
      const claim = await db.pushDelivery.updateMany({ where: { id: delivery.id, state: 'PENDING', nextAttemptAt: { lte: now } }, data: { state: 'SENDING', nextAttemptAt: new Date(now.getTime() + 60000), attempts: { increment: 1 } } });
      if (!claim.count) continue;
      try {
        await send({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(arrivalPayload(event.entry, subscription.locale)), {
          TTL: Math.max(1, Math.floor((event.createdAt.getTime() + ARRIVAL_MAX_AGE_MS - now.getTime()) / 1000)),
          timeout: 10000, urgency: 'high', topic: createHash('sha256').update(event.queueEntryId).digest('base64url').slice(0, 32),
        });
        await db.pushDelivery.updateMany({ where: { id: delivery.id }, data: { state: 'SENT' } });
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) {
          await db.pushSubscription.deleteMany({ where: { id: subscription.id } });
        } else {
          const terminal = delivery.attempts >= 4 || (error.statusCode >= 400 && error.statusCode < 500 && ![408, 429].includes(error.statusCode));
          await db.pushDelivery.updateMany({ where: { id: delivery.id }, data: { state: terminal ? 'FAILED' : 'PENDING', nextAttemptAt: new Date(now.getTime() + Math.min(120000, 10000 * 2 ** delivery.attempts)) } });
          // Never log endpoints, payloads or patient identities.
          console.warn('Notification delivery failed', { status: error.statusCode || 'network', retry: !terminal });
        }
      }
    }
  }
  // A crash after send can be retried; stable topic/tag collapses duplicate visible alerts.
  await db.pushDelivery.updateMany({ where: { state: 'SENDING', nextAttemptAt: { lte: now } }, data: { state: 'PENDING' } });
  await db.pushDelivery.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 7 * 86400000) } } });
}

import { createHash } from 'node:crypto';
import { canReceiveOutreachHivReactive, outreachHivReactivePayload } from './notification-policy.mjs';

const MAX_AGE_MS = 10 * 60000;
// Only app submissions logged after REDCap accepted the contact can create an alert.
export function reactiveOutreachContacts(activity) {
  if (activity.workflow !== 'outreach') return [];
  let rows;
  try { rows = JSON.parse(activity.submittedData); } catch { return []; }
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => row && row.uic_ori === activity.recordId && row.redcap_repeat_instrument === 'outreach_contact' && row.oc_hiv_rapid_result === '1' && /^[1-9]\d*$/.test(String(row.redcap_repeat_instance)));
}

export async function sendOutreachHivNotifications(db, send, now = new Date()) {
  const events = await db.redcapActivity.findMany({ where: { workflow: 'outreach', createdAt: { gte: new Date(now.getTime() - MAX_AGE_MS), lte: now } }, orderBy: { createdAt: 'asc' } });
  for (const event of events) {
    for (const contact of reactiveOutreachContacts(event)) {
      // Delivery keys use the saved record/instance, not the log ID: repeated logs cannot duplicate alerts.
      const eventKey = `outreach-hiv:${createHash('sha256').update(JSON.stringify([event.recordId, String(contact.redcap_repeat_instance)])).digest('hex')}`;
      const subscriptions = await db.pushSubscription.findMany({ where: { createdAt: { lte: event.createdAt } } });
      for (const subscription of subscriptions) {
        const user = await db.user.findUnique({ where: { id: subscription.userId }, include: { notificationPreference: true } });
        if (!user || !canReceiveOutreachHivReactive(user)) continue;
        const preference = user.notificationPreference;
        if (!preference?.enabled || !preference.outreachHivReactive || !preference.outreachHivReactiveEnabledAt || preference.outreachHivReactiveEnabledAt > event.createdAt) continue;
        const session = await db.session.findFirst({ where: { id: subscription.sessionId, userId: user.id, expiresAt: { gt: now } } });
        if (!session) { await db.pushSubscription.deleteMany({ where: { id: subscription.id } }); continue; }
        const key = { queueEntryId: eventKey, subscriptionId: subscription.id };
        const delivery = await db.pushDelivery.upsert({ where: { queueEntryId_subscriptionId: key }, create: { ...key, nextAttemptAt: now }, update: {} });
        if (delivery.state !== 'PENDING' || delivery.nextAttemptAt > now) continue;
        const claimed = await db.pushDelivery.updateMany({ where: { id: delivery.id, state: 'PENDING', nextAttemptAt: { lte: now } }, data: { state: 'SENDING', nextAttemptAt: new Date(now.getTime() + 60000), attempts: { increment: 1 } } });
        if (!claimed.count) continue;
        try {
          await send({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(outreachHivReactivePayload(event.recordId, eventKey, subscription.locale)), {
            TTL: Math.max(1, Math.floor((event.createdAt.getTime() + MAX_AGE_MS - now.getTime()) / 1000)), timeout: 10000, urgency: 'high', topic: createHash('sha256').update(eventKey).digest('base64url').slice(0, 32),
          });
          await db.pushDelivery.updateMany({ where: { id: delivery.id }, data: { state: 'SENT' } });
        } catch (error) {
          if ([404, 410].includes(error.statusCode)) await db.pushSubscription.deleteMany({ where: { id: subscription.id } });
          else {
            const terminal = delivery.attempts >= 4 || (error.statusCode >= 400 && error.statusCode < 500 && ![408, 429].includes(error.statusCode));
            await db.pushDelivery.updateMany({ where: { id: delivery.id }, data: { state: terminal ? 'FAILED' : 'PENDING', nextAttemptAt: new Date(now.getTime() + Math.min(120000, 10000 * 2 ** delivery.attempts)) } });
            console.warn('Outreach notification delivery failed', { status: error.statusCode || 'network', retry: !terminal });
          }
        }
      }
    }
  }
  await db.pushDelivery.updateMany({ where: { queueEntryId: { startsWith: 'outreach-hiv:' }, state: 'SENDING', nextAttemptAt: { lte: now } }, data: { state: 'PENDING' } });
  await db.pushDelivery.deleteMany({ where: { queueEntryId: { startsWith: 'outreach-hiv:' }, createdAt: { lt: new Date(now.getTime() - 7 * 86400000) } } });
}

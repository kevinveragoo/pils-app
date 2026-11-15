import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { canReceiveOutreachHivReactive, outreachHivReactivePayload } from '../lib/notification-policy.mjs';
import { reactiveOutreachContacts, sendOutreachHivNotifications } from '../lib/outreach-notification-sender.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pils-outreach-notifications-'));
const filename = path.join(dir, 'test.db');
execFileSync('python3', ['-c', `import sqlite3,pathlib,sys\nc=sqlite3.connect(sys.argv[1])\nfor p in sorted(pathlib.Path('prisma/migrations').glob('*/migration.sql')): c.executescript(p.read_text())\nc.close()`, filename]);
const db = new PrismaClient({ datasourceUrl: `file:${filename}` });
const now = new Date(), before = new Date(now.getTime() - 60000), saved = new Date(now.getTime() - 1000);
const recordId = 'TEST';
const contact = { uic_ori: recordId, redcap_repeat_instrument: 'outreach_contact', redcap_repeat_instance: '3', oc_hiv_rapid_result: '1' };
const event = { workflow: 'outreach', recordId, submittedData: JSON.stringify([contact]) };
try {
  const base = { organization: 'PILS', status: 'APPROVED', role: 'OUTREACH_WORKER', roles: '[]' };
  for (const role of ['OUTREACH_WORKER', 'HEALTHCARE_ASSISTANT', 'ADMIN']) assert.equal(canReceiveOutreachHivReactive({ ...base, role }), true);
  for (const patch of [{ role: 'FACILITY_STAFF' }, { role: 'HEALTHCARE_NAVIGATOR' }, { organization: 'CUT' }, { status: 'PENDING' }]) assert.equal(canReceiveOutreachHivReactive({ ...base, ...patch }), false);
  assert.equal(canReceiveOutreachHivReactive({ ...base, role: 'FACILITY_STAFF', roles: '["OUTREACH_WORKER"]' }), true);
  for (const code of ['', '0', '2', '3', '4']) assert.equal(reactiveOutreachContacts({ ...event, submittedData: JSON.stringify([{ ...contact, oc_hiv_rapid_result: code }]) }).length, 0);
  for (const patch of [{ workflow: 'clinic' }, { submittedData: 'invalid' }, { recordId: 'OTHER' }]) assert.equal(reactiveOutreachContacts({ ...event, ...patch }).length, 0);
  assert.equal(reactiveOutreachContacts(event).length, 1);
  for (const locale of ['en', 'fr', 'mfe']) {
    const payload = outreachHivReactivePayload(recordId, 'key', locale);
    assert.equal(payload.title, 'PILS'); assert.ok(!/hiv|reactive|TEST/i.test(payload.body)); assert.equal(payload.url, '/outreach?uic=TEST');
  }
  const user = await db.user.create({ data: { ...base, username: 'staff', name: 'Test', passwordHash: 'unused', requestedRole: base.role } });
  const preference = await db.notificationPreference.create({ data: { userId: user.id, enabled: true, clinicArrivals: false, outreachHivReactive: true, outreachHivReactiveEnabledAt: before } });
  const session = await db.session.create({ data: { userId: user.id, tokenHash: 'mock', expiresAt: new Date(now.getTime() + 3600000) } });
  const deviceData = { userId: user.id, sessionId: session.id, endpoint: 'https://web.push.apple.com/test', p256dh: 'mock', auth: 'mock', createdAt: before };
  await db.pushSubscription.create({ data: deviceData });
  const activityData = { userId: user.id, actorName: 'Test', actorUsername: 'staff', ...event, instrumentInstances: '[{"instrument":"outreach_contact","instance":3}]', createdAt: saved };
  const activity = await db.redcapActivity.create({ data: activityData });
  let sends = 0;
  const send = async (_subscription, raw, options) => { sends++; const payload = JSON.parse(raw); assert.ok(!/hiv|reactive|TEST/i.test(payload.body)); assert.ok(options.TTL <= 600); };
  await Promise.all([sendOutreachHivNotifications(db, send, now), sendOutreachHivNotifications(db, send, now)]); assert.equal(sends, 1, 'Concurrent workers claim once');
  await db.redcapActivity.create({ data: activityData }); await sendOutreachHivNotifications(db, send, now); assert.equal(sends, 1, 'Duplicate activity logs for one saved repeat do not duplicate delivery');
  async function reset() { await db.pushDelivery.deleteMany(); sends = 0; }
  await reset();
  for (const patch of [{ enabled: false }, { outreachHivReactive: false }, { outreachHivReactiveEnabledAt: now }]) {
    await db.notificationPreference.update({ where: { userId: user.id }, data: patch }); await sendOutreachHivNotifications(db, send, now); assert.equal(sends, 0);
    await db.notificationPreference.update({ where: { userId: user.id }, data: { enabled: true, outreachHivReactive: true, outreachHivReactiveEnabledAt: before } });
  }
  for (const patch of [{ organization: 'CUT' }, { status: 'REJECTED' }, { role: 'FACILITY_STAFF' }]) {
    await db.user.update({ where: { id: user.id }, data: patch }); await sendOutreachHivNotifications(db, send, now); assert.equal(sends, 0);
    await db.user.update({ where: { id: user.id }, data: base });
  }
  await db.redcapActivity.updateMany({ data: { submittedData: JSON.stringify([{ ...contact, oc_hiv_rapid_result: '2' }]) } });
  await sendOutreachHivNotifications(db, send, now); assert.equal(sends, 0, 'Non-reactive contact never alerts');
  await db.redcapActivity.updateMany({ data: { submittedData: event.submittedData } });
  await sendOutreachHivNotifications(db, async () => { const e = new Error('temporary'); e.statusCode = 503; throw e; }, now);
  assert.equal((await db.pushDelivery.findFirst()).state, 'PENDING');
  await sendOutreachHivNotifications(db, send, new Date(now.getTime() + 15000)); assert.equal(sends, 1, 'Transient failures retry');
  await reset(); await sendOutreachHivNotifications(db, send, new Date(now.getTime() + 11 * 60000)); assert.equal(sends, 0, 'Old activities expire');
  await sendOutreachHivNotifications(db, async () => { const e = new Error('expired endpoint'); e.statusCode = 410; throw e; }, now); assert.equal(await db.pushSubscription.count(), 0);
  await db.pushSubscription.create({ data: { ...deviceData, createdAt: now } }); await sendOutreachHivNotifications(db, send, now); assert.equal(sends, 0, 'New devices do not receive earlier activities');
  await db.pushSubscription.updateMany({ data: { createdAt: before } });
  await db.session.delete({ where: { id: session.id } }); await sendOutreachHivNotifications(db, send, now); assert.equal(sends, 0); assert.equal(await db.pushSubscription.count(), 0);
  assert.ok(activity.id); assert.equal(preference.outreachHivReactive, true);
  const sw = { handlers: {} };
  const context = { self: { location: { origin: 'https://app.test' }, addEventListener: (name, handler) => { sw.handlers[name] = handler; } }, URL };
  vm.createContext(context); vm.runInContext(fs.readFileSync('public/notifications-sw.js', 'utf8'), context);
  assert.equal(context.notificationTarget('/outreach?uic=TEST'), '/outreach?uic=TEST'); assert.equal(context.notificationTarget('https://evil.test/outreach'), '/clinic-queue'); assert.equal(context.notificationTarget('/admin/users'), '/clinic-queue');
  console.log('Outreach notifications passed: reactive-only saved repeats, permissions, independent opt-in, privacy, concurrent claims, deduplication, retries, expiry, logout and safe click targets. No real pushes sent.');
} finally { await db.$disconnect(); fs.rmSync(dir, { recursive: true, force: true }); }

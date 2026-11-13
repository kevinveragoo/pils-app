//
//  test-notifications.mjs
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { PrismaClient } from '@prisma/client';
import { canReceiveClinicArrivals, canReceiveOutreachReactiveHiv, reactiveHivEvents, validPushSubscription, arrivalPayload } from '../lib/notification-policy.mjs';
import { sendArrivalNotifications, sendOutreachReactiveHivNotifications, isLiveArrivalDate } from '../lib/notification-sender.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pils-notifications-'));
const filename = path.join(dir, 'test.db');
const sqlite = new DatabaseSync(filename);
for (const migration of fs.readdirSync('prisma/migrations').sort()) {
  const sql = path.join('prisma/migrations', migration, 'migration.sql');
  if (fs.existsSync(sql)) sqlite.exec(fs.readFileSync(sql, 'utf8'));
}
sqlite.close();
const db = new PrismaClient({ datasourceUrl: `file:${filename}` });
const now = new Date();
const before = new Date(now.getTime() - 30000);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Mauritius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const userData = { username: 'staff', name: 'Test staff', passwordHash: 'unused', requestedRole: 'FACILITY_STAFF', role: 'FACILITY_STAFF', organization: 'PILS', status: 'APPROVED' };
try {
  const afterMidnight = new Date('2026-10-23T20:00:01Z'); // 24 Oct in Mauritius.
  assert.equal(isLiveArrivalDate('2026-10-24', afterMidnight, afterMidnight), true);
  assert.equal(isLiveArrivalDate('2026-10-23', afterMidnight, afterMidnight), false);
  assert.equal(isLiveArrivalDate('2026-10-25', afterMidnight, afterMidnight), false);
  assert.equal(isLiveArrivalDate('2026-10-23', new Date('2026-10-23T19:59:59Z'), afterMidnight), false, 'No yesterday retry after midnight');
  assert.equal(isLiveArrivalDate('2026-10-24', new Date('2026-10-23T19:59:59Z'), afterMidnight), false, 'Future-date exercise must not become live on retry');
  // Keep worker eligibility aligned with the actual page role map.
  const roleModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/role-page-access.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: roleModule, exports: roleModule.exports, require: () => ({ isPilsUser: u => u.organization === 'PILS' }) });
  for (const [role, pages] of Object.entries(roleModule.exports.ROLE_PAGE_ACCESS)) assert.equal(canReceiveClinicArrivals({ ...userData, role }), pages.includes('Clinic Queue'));
  assert.equal(canReceiveClinicArrivals({ ...userData, role: 'OUTREACH_WORKER', roles: '["FACILITY_STAFF"]' }), true);
  for (const patch of [{ organization: 'CUT' }, { status: 'PENDING' }, { role: 'HEALTHCARE_NAVIGATOR' }]) assert.equal(canReceiveClinicArrivals({ ...userData, ...patch }), false);
  const sub = { endpoint: 'https://web.push.apple.com/test', keys: { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) } };
  assert.ok(validPushSubscription(sub));
  for (const endpoint of ['http://web.push.apple.com/test', 'https://127.0.0.1/test', 'https://web.push.apple.com.evil.test/test', 'https://web.push.apple.com:3000/test']) assert.equal(validPushSubscription({ ...sub, endpoint }), false);
  assert.match(arrivalPayload({ id: 'q', displayName: 'Sample', patientCode: null }).body, /Code pending/);
  assert.match(arrivalPayload({ id: 'q', displayName: 'Sample', patientCode: ' P123 ' }).body, /P123/);
  const user = await db.user.create({ data: userData });
  const session = await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update('test').digest('hex'), expiresAt: new Date(now.getTime() + 3600000) } });
  let currentUser = user;
  const routeModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/notifications/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    module: routeModule, exports: routeModule.exports, URL, Date, process: { env: { VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private', VAPID_SUBJECT: 'https://app.test' } },
    require: name => {
      if (name === 'node:crypto') return { createHash };
      if (name === 'web-push') return { sendNotification: async () => {} };
      if (name === 'next/headers') return { cookies: async () => ({ get: () => ({ value: 'test' }) }) };
      if (name === 'next/server') return { NextResponse: Response };
      if (name === '@/lib/auth') return { getCurrentUser: async () => currentUser, SESSION_COOKIE: 'pils_session' };
      if (name === '@/lib/db') return { db };
      if (name === '@/lib/notification-policy.mjs') return { canReceiveClinicArrivals, canReceiveOutreachReactiveHiv, validPushSubscription };
      throw new Error(name);
    },
  });
  const post = (body, origin = 'https://app.test') => routeModule.exports.POST(new Request('https://app.test/api/notifications', { method: 'POST', headers: { origin, host: 'app.test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  currentUser = null;
  assert.equal((await routeModule.exports.GET()).status, 401);
  assert.equal((await post({ action: 'preferences', enabled: true, clinicArrivals: true })).status, 401);
  currentUser = user;
  assert.equal((await post({ action: 'preferences', enabled: true, clinicArrivals: true }, 'https://evil.test')).status, 403);
  currentUser = { ...user, organization: 'CUT' };
  assert.equal((await post({ action: 'preferences', enabled: true, clinicArrivals: true })).status, 403);
  currentUser = user;
  assert.equal((await post({ action: 'subscribe', subscription: { ...sub, endpoint: 'https://127.0.0.1/' } })).status, 400);
  assert.equal((await post({ action: 'preferences', enabled: 'yes', clinicArrivals: true })).status, 400);
  assert.equal((await post({ action: 'subscribe', subscription: sub, locale: 'fr' })).status, 200);
  currentUser = { ...user, id: 'someone-else' };
  assert.equal((await post({ action: 'unsubscribe', endpoint: sub.endpoint })).status, 200);
  assert.equal(await db.pushSubscription.count(), 1, 'Unsubscribe cannot delete another account’s device');
  currentUser = user;
  await db.pushSubscription.deleteMany();
  const preference = await db.notificationPreference.create({ data: { userId: user.id, enabled: true, clinicArrivals: true, enabledAt: before } });
  const device = await db.pushSubscription.create({ data: { userId: user.id, sessionId: session.id, endpoint: sub.endpoint, ...sub.keys, createdAt: before } });
  const entry = await db.clinicQueueEntry.create({ data: { queueDate: today, displayName: 'Test patient', status: 'WAITING', createdById: user.id, createdByName: 'Test', updatedById: user.id, updatedByName: 'Test', events: { create: { actorId: user.id, actorName: 'Test', action: 'ARRIVED', createdAt: new Date(now.getTime() - 1000) } } } });
  let sends = 0;
  const send = async (_subscription, payload, options) => { sends++; assert.match(JSON.parse(payload).body, /Code pending/); assert.ok(options.TTL <= 600); };
  for (const queueDate of ['2000-01-01', '2099-01-01']) {
    await db.clinicQueueEntry.update({ where: { id: entry.id }, data: { queueDate } });
    await sendArrivalNotifications(db, send, now);
    assert.equal(sends, 0, 'Past/future queue exercises must not send');
    assert.equal(await db.pushDelivery.count(), 0, 'Exercises must not create deliveries');
  }
  await db.clinicQueueEntry.update({ where: { id: entry.id }, data: { queueDate: today } });
  await Promise.all([sendArrivalNotifications(db, send, now), sendArrivalNotifications(db, send, now)]);
  assert.equal(sends, 1, 'Concurrent workers claim once');
  await sendArrivalNotifications(db, send, now); assert.equal(sends, 1, 'No repeat on polling');
  await db.clinicQueueEvent.create({ data: { queueEntryId: entry.id, actorId: user.id, actorName: 'Test', action: 'ARRIVED', createdAt: now } });
  await sendArrivalNotifications(db, send, now); assert.equal(sends, 1, 'Repeated check-in event deduplicated per daily visit/device');
  async function reset() { await db.pushDelivery.deleteMany(); sends = 0; }
  await reset();
  await db.notificationPreference.update({ where: { userId: user.id }, data: { enabled: false } });
  await sendArrivalNotifications(db, send, now); assert.equal(sends, 0);
  await db.notificationPreference.update({ where: { userId: user.id }, data: { enabled: true, enabledAt: new Date(now.getTime() + 1) } });
  await sendArrivalNotifications(db, send, now); assert.equal(sends, 0, 'No historical alerts on opt-in');
  await db.notificationPreference.update({ where: { userId: user.id }, data: { enabledAt: preference.enabledAt } });
  for (const patch of [{ organization: 'CUT' }, { role: 'HEALTHCARE_NAVIGATOR' }, { status: 'REJECTED' }]) {
    await db.user.update({ where: { id: user.id }, data: patch });
    await sendArrivalNotifications(db, send, now); assert.equal(sends, 0, 'Revoked access cannot receive');
    await db.user.update({ where: { id: user.id }, data: userData });
  }
  await sendArrivalNotifications(db, async () => { const e = new Error('temporary'); e.statusCode = 503; throw e; }, now);
  const retry = await db.pushDelivery.findFirst(); assert.equal(retry.state, 'PENDING'); assert.equal(retry.attempts, 1);
  await sendArrivalNotifications(db, send, new Date(now.getTime() + 15000)); assert.equal(sends, 1, 'Transient failure retried');
  await reset();
  await sendArrivalNotifications(db, send, new Date(now.getTime() + 11 * 60000)); assert.equal(sends, 0, 'Stale arrival expires');
  await sendArrivalNotifications(db, async () => { const e = new Error('gone'); e.statusCode = 410; throw e; }, now);
  assert.equal(await db.pushSubscription.count(), 0, 'Expired endpoint removed');
  await db.pushSubscription.create({ data: { ...device, id: undefined } });
  // Service worker preserves safe activity deep links and rejects external URLs.
  const workerContext = { self: { addEventListener() {} } };
  vm.createContext(workerContext);
  vm.runInContext(fs.readFileSync('public/notifications-sw.js', 'utf8'), workerContext);
  const detailUrl = '/logs/details/app%3Atest123?from=2026-11-13&to=2026-11-13';
  assert.equal(workerContext.notificationUrl(detailUrl), detailUrl);
  assert.equal(workerContext.notificationUrl('/clinic-queue'), '/clinic-queue');
  for (const url of ['https://evil.test', '//evil.test', '/logs/details/../../admin', detailUrl + '&redirect=https://evil.test']) {
    assert.equal(workerContext.notificationUrl(url), '/notifications');
  }
  // Outreach eligibility applies to all approved PILS roles, never volunteers/partners.
  for (const role of Object.keys(roleModule.exports.ROLE_PAGE_ACCESS)) assert.equal(canReceiveOutreachReactiveHiv({ ...userData, role }), true);
  for (const organization of ['PILS_VOLUNTEER', 'CUT', 'AILES', null]) {
    assert.equal(canReceiveOutreachReactiveHiv({ ...userData, organization }), false);
    currentUser = { ...user, organization };
    const response = await post({ action: 'preferences', enabled: true, clinicArrivals: false, outreachReactiveHiv: true });
    assert.equal(response.status, 403);
    assert.equal((await (await routeModule.exports.GET()).json()).outreachReactiveHivEligible, false);
  }
  assert.equal(canReceiveOutreachReactiveHiv({ ...userData, status: 'PENDING' }), false);
  currentUser = { ...user, role: 'OUTREACH_WORKER' };
  assert.equal((await post({ action: 'preferences', enabled: true, clinicArrivals: false, outreachReactiveHiv: true })).status, 200);
  assert.equal((await (await routeModule.exports.GET()).json()).outreachReactiveHiv, true);
  assert.equal((await post({ action: 'preferences', enabled: true, clinicArrivals: false, outreachReactiveHiv: 'yes' })).status, 400);
  const activated = await db.notificationPreference.findUnique({ where: { userId: user.id } });
  assert.equal(activated.enabledAt.getTime(), preference.enabledAt.getTime(), 'Reactive opt-in preserves clinic activation time');
  currentUser = user;
  assert.equal((await post({ action: 'preferences', enabled: true, clinicArrivals: true, outreachReactiveHiv: true })).status, 200);
  assert.equal((await db.notificationPreference.findUnique({ where: { userId: user.id } })).outreachReactiveHivEnabledAt.getTime(), activated.outreachReactiveHivEnabledAt.getTime(), 'Clinic opt-in preserves reactive activation time');
  await db.user.update({ where: { id: user.id }, data: { role: 'OUTREACH_WORKER' } });
  await db.notificationPreference.update({ where: { userId: user.id }, data: { outreachReactiveHivEnabledAt: before } });
  await reset();
  const row = { uic_ori: 'TEST-UIC', redcap_repeat_instrument: 'outreach_contact', redcap_repeat_instance: '1', oc_hiv_rapid_result: '1' };
  const activityData = { userId: user.id, actorName: 'Test', actorUsername: 'staff', workflow: 'outreach', recordId: row.uic_ori, instrumentInstances: '[]', submittedData: JSON.stringify([row]), createdAt: new Date(now.getTime() - 1000) };
  for (const submittedData of ['invalid', '{}', JSON.stringify([{ ...row, oc_hiv_rapid_result: '0' }]), JSON.stringify([{ ...row, oc_hiv_rapid_result: '2' }]), JSON.stringify([{ ...row, redcap_repeat_instrument: 'partner_referral_partner' }])]) {
    assert.deepEqual(reactiveHivEvents({ ...activityData, submittedData }), []);
  }
  const activity = await db.redcapActivity.create({ data: { ...activityData, submittedData: JSON.stringify([{ ...row, oc_hiv_rapid_result: '0' }]) } });
  const sendReactive = async (_subscription, payload, options) => {
    sends++;
    assert.match(JSON.parse(payload).url, /^\/logs\/details\/app%3A.+\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
    assert.doesNotMatch(payload, /TEST-UIC|reactive HIV|reactive test/);
    assert.ok(options.TTL <= 600);
  };
  await sendOutreachReactiveHivNotifications(db, sendReactive, now); assert.equal(sends, 0, 'Non-reactive result never alerts');
  await db.redcapActivity.update({ where: { id: activity.id }, data: { submittedData: activityData.submittedData } });
  await Promise.all([sendOutreachReactiveHivNotifications(db, sendReactive, now), sendOutreachReactiveHivNotifications(db, sendReactive, now)]);
  assert.equal(sends, 1, 'Concurrent reactive notifications deduplicate');
  await db.redcapActivity.create({ data: activityData });
  await sendOutreachReactiveHivNotifications(db, sendReactive, now); assert.equal(sends, 1, 'Same clinical instance deduplicates across activity logs');
  await reset();
  for (const patch of [{ organization: 'PILS_VOLUNTEER' }, { organization: 'CUT' }, { status: 'REJECTED' }]) {
    await db.user.update({ where: { id: user.id }, data: patch });
    await sendOutreachReactiveHivNotifications(db, sendReactive, now); assert.equal(sends, 0, 'Revoked reactive access cannot receive');
    await db.user.update({ where: { id: user.id }, data: { ...userData, role: 'OUTREACH_WORKER' } });
  }
  for (const patch of [{ enabled: false }, { outreachReactiveHiv: false }, { outreachReactiveHivEnabledAt: new Date(now.getTime() + 1) }]) {
    await db.notificationPreference.update({ where: { userId: user.id }, data: patch });
    await sendOutreachReactiveHivNotifications(db, sendReactive, now); assert.equal(sends, 0, 'Opt-out and late opt-in suppress reactive alerts');
    await db.notificationPreference.update({ where: { userId: user.id }, data: { enabled: true, outreachReactiveHiv: true, outreachReactiveHivEnabledAt: before } });
  }
  await sendOutreachReactiveHivNotifications(db, sendReactive, new Date(now.getTime() + 11 * 60000)); assert.equal(sends, 0, 'Stale reactive alerts expire');
  await sendOutreachReactiveHivNotifications(db, async () => { const e = new Error('temporary'); e.statusCode = 503; throw e; }, now);
  await sendOutreachReactiveHivNotifications(db, sendReactive, new Date(now.getTime() + 15000)); assert.equal(sends, 1, 'Reactive transient failure retries');
  await reset();
  await db.session.delete({ where: { id: session.id } });
  await sendOutreachReactiveHivNotifications(db, sendReactive, now); assert.equal(sends, 0, 'Logout suppresses reactive alerts');

  await sendArrivalNotifications(db, send, now); assert.equal(sends, 0, 'Logged-out device receives nothing');
  assert.equal(await db.pushSubscription.count(), 0);
  console.log('Notification checks passed: page access, multi-role users, endpoint validation, payloads, Mauritius dates/midnight retries, atomic claims, clinic arrivals, reactive outreach results, category isolation, safe activity links, opt-out, access revocation, retries, expiry and logout. No push messages sent.');
} finally { await db.$disconnect(); fs.rmSync(dir, { recursive: true, force: true }); }

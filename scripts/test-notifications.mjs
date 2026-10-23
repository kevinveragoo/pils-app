// Elisa Kevin Veragoo + ChatGPT
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { PrismaClient } from '@prisma/client';
import { canReceiveClinicArrivals, validPushSubscription, arrivalPayload } from '../lib/notification-policy.mjs';
import { sendArrivalNotifications } from '../lib/notification-sender.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pils-notifications-'));
const filename = path.join(dir, 'test.db');
execFileSync('python3', ['-c', `import sqlite3,pathlib,sys\nc=sqlite3.connect(sys.argv[1])\nfor p in sorted(pathlib.Path('prisma/migrations').glob('*/migration.sql')): c.executescript(p.read_text())\nc.close()`, filename]);
const db = new PrismaClient({ datasourceUrl: `file:${filename}` });
const now = new Date();
const before = new Date(now.getTime() - 30000);
const userData = { username: 'staff', name: 'Test staff', passwordHash: 'unused', requestedRole: 'FACILITY_STAFF', role: 'FACILITY_STAFF', organization: 'PILS', status: 'APPROVED' };
try {
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
      if (name === '@/lib/notification-policy.mjs') return { canReceiveClinicArrivals, validPushSubscription };
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
  const entry = await db.clinicQueueEntry.create({ data: { queueDate: '2026-10-23', displayName: 'Test patient', status: 'WAITING', createdById: user.id, createdByName: 'Test', updatedById: user.id, updatedByName: 'Test', events: { create: { actorId: user.id, actorName: 'Test', action: 'ARRIVED', createdAt: new Date(now.getTime() - 1000) } } } });
  let sends = 0;
  const send = async (_subscription, payload, options) => { sends++; assert.match(JSON.parse(payload).body, /Code pending/); assert.ok(options.TTL <= 600); };
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
  await db.session.delete({ where: { id: session.id } });
  await sendArrivalNotifications(db, send, now); assert.equal(sends, 0, 'Logged-out device receives nothing');
  assert.equal(await db.pushSubscription.count(), 0);
  console.log('Notification checks passed: page access, multi-role users, endpoint validation, payloads, atomic claims, duplicate arrivals, opt-out, access revocation, retries, expiry and logout. No push messages sent.');
} finally { await db.$disconnect(); fs.rmSync(dir, { recursive: true, force: true }); }

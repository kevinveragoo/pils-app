// Elisa Kevin Veragoo + ChatGPT
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import ts from 'typescript';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-deduplication-'));
const database = path.join(directory, 'test.db');
const migrations = path.resolve('prisma/migrations');
const latest = '20261023120000_unique_daily_queue_client';
function migrate(names) {
  execFileSync('python3', ['-c', 'import sqlite3,sys,pathlib; db=sqlite3.connect(sys.argv[1]); db.execute("PRAGMA foreign_keys=ON"); [db.executescript(pathlib.Path(p).read_text()) for p in sys.argv[2:]]; db.close()', database, ...names.map(name => path.join(migrations, name, 'migration.sql'))]);
}
const db = new PrismaClient({ datasources: { db: { url: `file:${database}` } } });
try {
  migrate(fs.readdirSync(migrations).filter(name => name !== latest && fs.statSync(path.join(migrations, name)).isDirectory()).sort());
  const base = { queueDate: '2026-10-23', displayName: 'Test client', createdById: 'test', createdByName: 'Test', updatedById: 'test', updatedByName: 'Test' };
  await db.clinicQueueEntry.create({ data: { ...base, id: 'first', recordId: ' client ', status: 'WAITING', queueNumber: 1, notes: 'Original notes', events: { create: { actorId: 'test', actorName: 'Test', action: 'ADDED' } } } });
  await db.clinicQueueEntry.create({ data: { ...base, id: 'advanced', recordId: 'CLIENT', status: 'READY', queueNumber: 2, notes: 'Later notes', events: { create: { actorId: 'test', actorName: 'Test', action: 'READY' } } } });
  migrate([latest]);
  assert.equal(await db.clinicQueueEntry.count(), 1);
  assert.equal((await db.clinicQueueEntry.findFirst()).id, 'advanced');
  assert.equal(await db.clinicQueueEvent.count({ where: { queueEntryId: 'advanced' } }), 2);
  const archived = await db.$queryRawUnsafe('SELECT id, notes FROM ClinicQueueDuplicateArchive');
  assert.equal(archived.length, 2);
  assert.ok(archived.some(row => row.notes === 'Original notes'));
  const workflow = { exports: {} };
  const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compile('lib/visit-workflow.ts'), { module: workflow, exports: workflow.exports });
  const queue = { exports: {} };
  vm.runInNewContext(compile('lib/clinic-queue.ts'), { module: queue, exports: queue.exports, Date, Intl, console, require: name => name === '@/lib/db' ? { db } : workflow.exports });
  const actor = { id: 'test', name: 'Test' };
  const payload = { ...base, recordId: ' retry ', status: 'WAITING', currentStation: 'DOCTOR', tasks: ['DOCTOR'] };
  const results = await Promise.all(Array.from({ length: 6 }, () => queue.exports.createQueueEntry(payload, actor)));
  assert.equal(new Set(results.map(entry => entry.id)).size, 1);
  assert.equal(new Set(results.map(entry => entry.queueNumber)).size, 1);
  assert.equal(await db.clinicQueueEntry.count({ where: { recordId: 'RETRY' } }), 1);
  assert.equal(await db.clinicQueueEvent.count({ where: { queueEntryId: results[0].id } }), 1);
  await db.clinicQueueEntry.update({ where: { id: results[0].id }, data: { status: 'DONE' } });
  const repeat = await queue.exports.createQueueEntry({ ...payload, source: 'SCHEDULED' }, actor);
  assert.equal(repeat.id, results[0].id);
  assert.equal(repeat.status, 'DONE');
  assert.equal(repeat.alreadyQueued, true);
  assert.equal((await queue.exports.createQueueEntry({ ...payload, queueDate: '2026-10-24' }, actor)).queueDate, '2026-10-24');
  await assert.rejects(db.clinicQueueEntry.create({ data: { ...base, recordId: 'RETRY' } }), { code: 'P2002' });
  console.log('Daily queue uniqueness passed: migration archives, retained progress, audit history, concurrent retries, cross-source repeats, completed visits and separate dates.');
} finally {
  await db.$disconnect();
  fs.rmSync(directory, { recursive: true, force: true });
}

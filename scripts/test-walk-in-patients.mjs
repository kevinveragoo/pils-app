import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const state = [], requests = [], listeners = new Map(); let effect, interval, initial;
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/useWalkInPatients.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
 module: mod, exports: mod.exports, AbortController,
 require: name => { assert.equal(name, 'react'); return {
  useState: value => { const i = state.length; state.push(value); return [value, next => { state[i] = next; }]; },
  useRef: value => ({ current: value }), useCallback: fn => fn, useEffect: fn => { effect = fn; }
 }; },
 fetch: (url, options) => { assert.equal(url, '/api/redcap/patients'); assert.equal(options.cache, 'no-store'); return new Promise(resolve => requests.push({ resolve, signal: options.signal })); },
 window: { setTimeout: fn => { initial = fn; return 1; }, clearTimeout: () => {}, setInterval: fn => { interval = fn; return 2; }, clearInterval: () => {}, addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event) },
 document: { visibilityState: 'visible', addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event) }
});
const patient = { uic: 'M27011988C_MN', display_name: 'Test', alias: '' };
const flush = () => new Promise(resolve => setImmediate(resolve));
const hook = mod.exports.useWalkInPatients(true), cleanup = effect();
initial(); assert.equal(state[1], true); assert.equal(requests.length, 1);
requests[0].resolve(Response.json([patient])); await flush(); assert.equal(state[0][0].uic, patient.uic); assert.equal(state[1], false);
const failed = hook.refresh(); assert.equal(state[0].length, 0, 'Do not search stale data during refresh');
requests[1].resolve(Response.json({ error: 'failed' }, { status: 500 })); await failed;
assert.ok(state[2], 'Loading failure is visible'); assert.equal(state[0].length, 0); assert.equal(state[1], false);
const retry = hook.refresh(); requests[2].resolve(Response.json([patient])); await retry; assert.equal(state[2], ''); assert.equal(state[0].length, 1);
const old = hook.refresh(), latest = hook.refresh(); assert.equal(requests[3].signal.aborted, true);
requests[4].resolve(Response.json([patient])); await latest;
requests[3].resolve(Response.json([{ ...patient, uic: 'STALE' }])); await old;
assert.equal(state[0][0].uic, patient.uic, 'Old response cannot overwrite the newest list');
listeners.get('focus')(); requests[5].resolve(Response.json([patient])); await flush();
interval(); requests[6].resolve(Response.json([patient])); await flush();
listeners.get('visibilitychange')(); cleanup(); assert.equal(requests[7].signal.aborted, true);
requests[7].resolve(Response.json([])); await flush(); assert.equal(listeners.size, 0);
const route = fs.readFileSync('app/api/redcap/patients/route.ts', 'utf8'); assert.ok(route.includes('private, no-store, max-age=0'));
console.log('Walk-in patient loading passed: uncached requests, visible failures, retry, stale-response protection, focus/periodic refresh and cleanup. No network requests made.');

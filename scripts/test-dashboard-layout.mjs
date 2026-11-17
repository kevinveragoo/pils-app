import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';

const storage = new Map();
const handlers = new Set();
let blocked = false;
const fakeWindow = {
  localStorage: {
    getItem(key) { if (blocked) throw Error('Blocked'); return storage.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw Error('Quota exceeded'); storage.set(key, value); },
    removeItem(key) { if (blocked) throw Error('Blocked'); storage.delete(key); },
  },
  addEventListener(type, fn) { assert.equal(type, 'storage'); handlers.add(fn); },
  removeEventListener(type, fn) { assert.equal(type, 'storage'); handlers.delete(fn); },
};
function load(file) {
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: loaded, exports: loaded.exports, window: fakeWindow,
    require: name => { if (name === './dashboard-cards' || name === './dashboard-default-cards') return load(`lib/${name.slice(2)}.ts`); throw Error(name); },
  });
  return loaded.exports;
}
const layout = load('lib/dashboard-card-layout.ts');
const { dashboardCards } = load('lib/dashboard-cards.ts');
const ids = [...layout.defaultCardOrder];
const plain = value => JSON.parse(JSON.stringify(value));
assert.equal(ids.length, 41);
assert.ok(ids.slice(0, 25).every(id => !dashboardCards.find(card => card.id === id).blank));
assert.ok(ids.slice(25).every(id => dashboardCards.find(card => card.id === id).blank));
for (const bad of ['', '{', '{}', 'null', '42']) assert.deepEqual(plain(layout.parseCardOrder(bad)), ids);
const parsed = plain(layout.parseCardOrder(JSON.stringify([ids[3], ids[3], 'removed-card', 123, ids[1]])));
assert.equal(parsed.length, 41);
assert.equal(new Set(parsed).size, 41);
assert.deepEqual(parsed.slice(0, 2), [ids[3], ids[1]]);
const moved = plain(layout.moveCard(ids, ids[0], ids[40]));
assert.equal(moved[40], ids[0]);
assert.deepEqual(plain(layout.moveCard(moved, ids[0], moved[0])), ids);
assert.deepEqual(plain(layout.moveCard(ids, 'unknown', ids[2])), ids);
assert.equal(layout.getServerCardOrder(), '', 'SSR never reads a browser-specific layout');
assert.equal(layout.getCardOrderSnapshot(), '');
let notifications = 0;
const unsubscribe = layout.subscribeCardOrder(() => notifications++);
layout.saveCardOrder(moved);
assert.equal(notifications, 1);
assert.deepEqual(JSON.parse(storage.get(layout.cardOrderStorageKey)), moved, 'Only card IDs are persisted');
assert.deepEqual(plain(layout.parseCardOrder(layout.getCardOrderSnapshot())), moved);
const reloaded = load('lib/dashboard-card-layout.ts');
assert.deepEqual(plain(reloaded.parseCardOrder(reloaded.getCardOrderSnapshot())), moved, 'A reload restores placement');
storage.set(layout.cardOrderStorageKey, JSON.stringify(ids));
for (const handler of handlers) handler({ key: layout.cardOrderStorageKey });
assert.equal(notifications, 2);
assert.deepEqual(plain(layout.parseCardOrder(layout.getCardOrderSnapshot())), ids, 'Cross-tab changes notify the grid');
blocked = true;
layout.saveCardOrder(moved);
assert.deepEqual(plain(layout.parseCardOrder(layout.getCardOrderSnapshot())), moved, 'Blocked storage still permits in-memory reordering');
layout.resetCardOrder();
assert.deepEqual(plain(layout.parseCardOrder(layout.getCardOrderSnapshot())), ids);
blocked = false;
layout.saveCardOrder(moved);
layout.resetCardOrder();
assert.equal(storage.has(layout.cardOrderStorageKey), false);
assert.deepEqual(plain(layout.parseCardOrder(layout.getCardOrderSnapshot())), ids);
unsubscribe();
assert.equal(handlers.size, 0);
const { defaultDashboardCards } = load('lib/dashboard-default-cards.ts');
const defaultIds = defaultDashboardCards.map(card => card.id);
const defaultMoved = plain(layout.moveCard(defaultIds, defaultIds[0], defaultIds.at(-1)));
layout.saveCardOrder(moved);
layout.defaultCardLayout.save(defaultMoved);
assert.deepEqual(plain(layout.parseCardOrder(layout.defaultCardLayout.getSnapshot(), defaultIds)), defaultMoved);
assert.deepEqual(plain(layout.parseCardOrder(layout.getCardOrderSnapshot())), moved, 'Default placement does not overwrite Executive placement');
layout.defaultCardLayout.reset();
assert.deepEqual(plain(layout.parseCardOrder(layout.getCardOrderSnapshot())), moved, 'Resetting Default leaves Executive placement intact');
layout.resetCardOrder();
// Exercise the actual grid handlers with synthetic pointer targets and a
// three-column layout; these interactions must persist the requested position.
const slots = ids.map((id, index) => ({ dataset: { indicatorSlot: id }, offsetTop: Math.floor(index / 3) * 320 }));
let focused = false, hit = slots[4], captured = false, refIndex = 0;
const gridElement = { contains: element => slots.includes(element), querySelectorAll: () => slots, querySelector: () => ({ focus: () => { focused = true; } }) };
const refs = [{ current: gridElement }, { current: null }];
const ui = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/DashboardCardGrid.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  module: ui, exports: ui.exports,
  document: { elementFromPoint: () => ({ closest: () => hit }) },
  requestAnimationFrame: fn => { fn(); return 1; },
  require: name => {
    if (name === 'react') return {
      useMemo: fn => fn(), useRef: () => refs[refIndex++], useState: initial => [initial, () => {}], useEffect: () => {},
      useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    };
    if (name === 'react/jsx-runtime') return jsxRuntime;
    if (name === '@/components/Localization') return { useLocalization: () => ({ t: text => text }) };
    if (name === '@/lib/dashboard-cards') return { dashboardCards };
    if (name === '@/lib/dashboard-card-layout') return layout;
    if (name === '@/components/DashboardIndicatorCard') return { DashboardIndicatorCard: () => null };
    if (name === 'lucide-react') return { GripVertical: () => null };
    throw Error(name);
  },
});
const renderGrid = () => { refIndex = 0; return ui.exports.DashboardCardGrid({ loading: false }); };
const handle = () => renderGrid().props.children[2].props.children[0].props.children[0];
const target = {
  setPointerCapture: () => { captured = true; }, hasPointerCapture: () => captured,
  releasePointerCapture: () => { captured = false; },
};
const pointer = (x, y) => ({ isPrimary: true, button: 0, pointerId: 7, clientX: x, clientY: y, currentTarget: target });
let button = handle();
button.props.onPointerDown(pointer(100, 100));
button.props.onPointerMove(pointer(150, 450));
button.props.onPointerUp(pointer(150, 450));
assert.equal(layout.parseCardOrder(layout.getCardOrderSnapshot())[4], ids[0], 'Pointer drop moves to the target grid cell');
assert.equal(captured, false);
layout.resetCardOrder();
button = handle();
button.props.onPointerDown(pointer(100, 100));
button.props.onPointerMove(pointer(150, 450));
button.props.onPointerCancel(pointer(150, 450));
assert.deepEqual(plain(layout.parseCardOrder(layout.getCardOrderSnapshot())), ids, 'Cancelled drag does not persist a move');
button.props.onPointerDown(pointer(100, 100));
button.props.onPointerMove(pointer(102, 102));
button.props.onPointerUp(pointer(102, 102));
assert.deepEqual(plain(layout.parseCardOrder(layout.getCardOrderSnapshot())), ids, 'Clicking a handle does not accidentally reorder');
button.props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} });
assert.equal(layout.parseCardOrder(layout.getCardOrderSnapshot())[3], ids[0], 'ArrowDown moves one grid row');
assert.equal(focused, true, 'Keyboard movement restores handle focus');
layout.resetCardOrder();
handle().props.onKeyDown({ key: 'End', preventDefault: () => {} });
assert.equal(layout.parseCardOrder(layout.getCardOrderSnapshot())[40], ids[0], 'End moves to the final cell');
layout.resetCardOrder();
console.log('Dashboard placement checks passed: default template order, saved layouts, corrupted/stale IDs, moves, reload, cross-tab updates, reset and unavailable local storage. No patient data saved.');

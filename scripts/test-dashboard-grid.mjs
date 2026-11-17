import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const store = new Map(), slots = [];let cursor = 0, effects = [], target = 'c';
const loaded = { exports: {} };
const jsx = (type, props) => ({ type, props });
const storageKey = 'pils.dashboard.grid.v1';
store.set(storageKey, JSON.stringify(['c', 'obsolete', 'a', 'a']));
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/DashboardGrid.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
 module: loaded, exports: loaded.exports, requestAnimationFrame: fn => { fn(); return 1; }, cancelAnimationFrame() {},
 localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
 document: { elementFromPoint: () => ({ closest: () => ({ dataset: { dashboardGridCard: target } }) }) },
 require: name => {
  if (name === 'react') return { Children: { toArray: children => children }, isValidElement: value => Boolean(value?.props), useState: initial => { const i = cursor++;if (!(i in slots)) slots[i] = initial;return [slots[i], value => { slots[i] = value; }]; }, useRef: initial => { const i = cursor++;return slots[i] ??= { current: initial }; }, useEffect: fn => effects.push(fn) };
  if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
  if (name === '@/components/Localization') return { useLocalization: () => ({ t: text => text }) };
  return { default: {} };
 }
});
const cards = ['a', 'b', 'c'].map(key => ({ key, props: { title: key, infoKey: 'testing' } }));
function render(children = cards) { cursor = 0;effects = [];return loaded.exports.DashboardGrid({ children }); }
function items(tree) { return tree.props.children[1].props.children; }
const ids = tree => items(tree).map(item => item.props['data-dashboard-grid-card']).join(',');
let tree = render();effects[0]();tree = render();assert.equal(ids(tree), 'c,a,b');
const handle = items(tree)[2].props.children[0];let prevented = false;
handle.props.onKeyDown({ key: 'ArrowUp', preventDefault: () => { prevented = true; } });
assert.ok(prevented);tree = render();assert.equal(ids(tree), 'c,b,a');assert.equal(JSON.parse(store.get(storageKey)).slice(0, 3).join(','), 'c,b,a');
// Mouse/touch share pointer handlers; drop on another card persists the new order.
const dragHandle = items(tree)[0].props.children[0];
dragHandle.props.onPointerDown({ button: 0, clientX: 0, clientY: 0, pointerId: 1, currentTarget: { setPointerCapture() {} } });
dragHandle.props.onPointerMove({ clientX: 30, clientY: 30 });target = 'a';dragHandle.props.onPointerUp({ clientX: 30, clientY: 30 });
tree = render();assert.equal(ids(tree), 'b,a,c');
// Temporarily unavailable cards retain their saved position when they return.
assert.equal(ids(render([cards[0]])), 'a');assert.equal(ids(render()), 'b,a,c');
// Reload restores local storage; reset clears it and restores the initial layout.
slots.length = 0;tree = render();effects[0]();tree = render();assert.equal(ids(tree), 'b,a,c');
tree.props.children[0].props.children.props.onClick();assert.equal(ids(render()), 'a,b,c');assert.equal(store.has(storageKey), false);
slots.length = 0;store.set(storageKey, '{bad JSON');render();assert.doesNotThrow(() => effects[0]());assert.equal(ids(render()), 'a,b,c');
console.log('Dashboard grid passed: saved order, keyboard/pointer movement, reload, temporarily hidden cards, reset and malformed storage.');

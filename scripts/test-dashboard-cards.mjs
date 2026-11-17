import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const info = { exports: {} };vm.runInNewContext(compile('lib/dashboard-card-info.ts'), { module: info, exports: info.exports });
for (const key of ['clients', 'rapidEncounters', 'labEncounters', 'commodityUnits', 'testing', 'trend', 'commodities', 'filters', 'hiv', 'syphilis', 'hcv', 'hbv']) {
 const content = info.exports.dashboardCardInfo(key);
 assert.ok(content.calculation);assert.ok(content.assumptions.length);assert.ok(content.fields.includes('uic_ori'));
}
for (const [key, fields] of Object.entries({ hiv: ['oc_hiv_rapid_result', 'cnv_hiv_lab_result', 'pv_hiv_result'], syphilis: ['oc_syp_result', 'cnv_syp_lab_result', 'pv_syphilis_result'], hcv: ['oc_hepc_result', 'cnv_hcv_lab_result', 'pv_hcv_result'], hbv: ['oc_hepb_result', 'cnv_hbv_lab_result', 'pv_hbv_result'] })) for (const field of fields) assert.ok(info.exports.dashboardCardInfo(key).fields.includes(field), `${key}: ${field}`);
let flipped = false, refIndex = 0, frontFocused = 0, backFocused = 0;
const refs = [{ current: { focus: () => frontFocused++ } }, { current: { focus: () => backFocused++ } }];
const component = { exports: {} };
vm.runInNewContext(compile('components/DashboardCard.tsx'), { module: component, exports: component.exports, requestAnimationFrame: fn => fn(),
 require: name => {
  if (name.endsWith('.module.css')) return { default: { card: 'card', inner: 'inner', front: 'front', back: 'back', infoButton: 'infoButton' } };
  if (name === 'react') return { useId: () => 'info', useRef: () => refs[refIndex++], useState: () => [flipped, value => { flipped = value; }] };
  if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  if (name === '@/components/Localization') return { useLocalization: () => ({ t: value => value }) };
  if (name === '@/lib/dashboard-card-info') return info.exports;
  return {};
 }
});
function render() { refIndex = 0; return component.exports.DashboardCard({ title: 'HIV', infoKey: 'hiv', children: 'Chart' }); }
let card = render(), faces = card.props.children.props.children;
assert.equal(faces[0].props.inert, false);assert.equal(faces[1].props.inert, true);
faces[0].props.children[0].props.onClick();card = render();faces = card.props.children.props.children;
assert.equal(card.props.children.props['data-flipped'], true);assert.equal(faces[0].props['aria-hidden'], true);assert.equal(faces[1].props.inert, false);assert.equal(backFocused, 1);
let prevented = false;card.props.onKeyDown({ key: 'Escape', preventDefault: () => { prevented = true; } });
assert.equal(flipped, false);assert.equal(frontFocused, 1);assert.ok(prevented);
card = render();faces = card.props.children.props.children;faces[0].props.children[0].props.onClick();card = render();faces = card.props.children.props.children;faces[1].props.children[0].props.onClick();assert.equal(flipped, false);
const css = fs.readFileSync('components/DashboardCard.module.css', 'utf8');assert.ok(css.includes('rotateY(180deg)'));assert.ok(css.includes('@media (prefers-reduced-motion: reduce) { .inner'));
console.log('Dashboard cards passed: calculation/field coverage, flip controls, inactive-face accessibility, focus return, Escape and reduced motion.');

/*
 * Runs every preset through jsx/host.jsx against the After Effects mock.
 * Checks: ES3 syntax of host.jsx and of every generated expression, known
 * match names only, no warnings, every expression evaluates to the right shape.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { loadHost, evalExpression } = require('./ae-mock');

const EXT = path.join(__dirname, '..', 'extension', 'com.cyriq.cyriqcap');
require(path.join(EXT, 'js/core/expr.js'));
require(path.join(EXT, 'js/core/presets.js'));
require(path.join(EXT, 'js/core/builder.js'));
const CQ = global.CQ;

let failures = 0;
function fail(msg) { failures++; console.log('  FAIL ' + msg); }

// 1. host.jsx must be valid ES3 (ExtendScript)
const hostSrc = fs.readFileSync(path.join(EXT, 'jsx/host.jsx'), 'utf8');
try { acorn.parse(hostSrc, { ecmaVersion: 3, allowReserved: false }); console.log('host.jsx parses as ES3'); }
catch (e) { fail('host.jsx ES3 syntax: ' + e.message); }

function checkExprShape(code, value, kind) {
  try { acorn.parse(code, { ecmaVersion: 3 }); } catch (e) { throw new Error('ES3 syntax: ' + e.message + '\n' + code); }
  const times = [0, 0.1, 0.3, 0.7, 1.2, 2.5, 3.7, 3.95, 4.1];
  for (const t of times) {
    for (const idx of [1, 2, 5, 9]) {
      const r = evalExpression(code, { value, env: { time: t, textIndex: idx, textTotal: 9 } });
      if (kind === 'selector') {
        if (!Array.isArray(r) || r.length !== 3 || r.some(v => !isFinite(v))) throw new Error('selector must return [a,a,a], got ' + JSON.stringify(r));
        if (r[0] < -400 || r[0] > 400) throw new Error('selector out of range ' + r[0]);
      } else if (kind === 'path') {
        if (!r || !r.points) throw new Error('path expression must return createPath()');
      } else if (Array.isArray(value)) {
        if (!Array.isArray(r) || r.length !== value.length || r.some(v => !isFinite(v))) throw new Error('expected array[' + value.length + '], got ' + JSON.stringify(r));
      } else if (typeof value === 'number') {
        if (typeof r !== 'number' || !isFinite(r)) throw new Error('expected number, got ' + JSON.stringify(r));
      }
    }
  }
}

function valueFor(prop) {
  const m = prop.matchName;
  if (m === 'ADBE Text Expressible Amount') return { value: [100, 100, 100], kind: 'selector' };
  if (m === 'ADBE Vector Shape') return { value: null, kind: 'path' };
  if (/Color|-0012|-0013/.test(m) && prop.parentProperty && /Glo2/.test(prop.parentProperty.matchName)) return { value: [1, 1, 1, 1], kind: 'color' };
  if (['ADBE Position', 'ADBE Anchor Point', 'ADBE Vector Rect Size', 'ADBE Vector Rect Position', 'ADBE Scale', 'ADBE Ramp-0001', 'ADBE Ramp-0003', 'CC Burn Film-0002'].includes(m)) return { value: [0, 0], kind: 'array' };
  return { value: 0, kind: 'number' };
}

function runPreset(p, opts) {
  const state = { issues: [], expressions: [], undo: [], plugins: opts.plugins };
  const { ctx, env } = loadHost(state);
  const layer = env.comp.layers.addText(p.sample.replace(/\n/g, '\r'));
  layer.selected = true;
  layer.inPoint = 0.15; layer.outPoint = 4;
  const built = CQ.builder.build(p, opts.options || {});
  const res = JSON.parse(ctx.CQ.applyPreset(JSON.stringify({ preset: built })));
  return { res, state, env, layer, built, ctx };
}

const presets = CQ.presets.list;
let exprCount = 0;
for (const p of presets) {
  const { res, state, env, built, ctx } = runPreset(p, { plugins: true });
  const label = p.id;
  if (!res.ok) { fail(label + ': ' + res.code + ' ' + res.message); continue; }
  const r = res.results[0];
  if (!r.ok) fail(label + ': ' + r.error);
  r.warnings.filter(w => !/^FONT_MISSING/.test(w)).forEach(w => fail(label + ' warning: ' + w));
  state.issues.forEach(i => fail(label + ': ' + i));
  if (state.undo[0] !== 'begin:CyriqCap: ' + p.name || state.undo[state.undo.length - 1] !== 'end') fail(label + ': undo group not balanced');
  for (const e of state.expressions) {
    exprCount++;
    const v = valueFor(e.prop);
    try { checkExprShape(e.code, v.value, v.kind); }
    catch (err) { fail(label + ' expression on ' + e.prop.matchName + ': ' + err.message.split('\n')[0]); }
  }
  // apply twice must not duplicate (old preset is removed first)
  const again = JSON.parse(ctx.CQ.applyPreset(JSON.stringify({ preset: built })));
  const anims = env.comp._layers.find(l => l.selected).property('ADBE Text Properties').property('ADBE Text Animators').numProperties;
  if (anims !== built.anims.length) fail(label + ': re-apply left ' + anims + ' animators, expected ' + built.anims.length);
  const extrasNow = env.comp._layers.filter(l => /CyriqCapExtraOf/.test(l.comment)).length;
  if (again.ok && built.extras.length && extrasNow === 0) fail(label + ': helper layers missing after re-apply');
}
console.log('presets checked: ' + presets.length + ', expressions evaluated: ' + exprCount);

// plug-in gating: presets that need plug-ins must refuse when absent
for (const p of presets.filter(x => (x.needs || []).length)) {
  const { res, state } = runPreset(p, { plugins: false });
  if (res.ok || res.code !== 'PLUGIN_MISSING') fail(p.id + ': expected PLUGIN_MISSING without plug-ins, got ' + JSON.stringify(res).slice(0, 120));
  if (state.undo.length) fail(p.id + ': project was modified although plug-in is missing');
}

// no text layer selected
{
  const state = { issues: [], expressions: [], undo: [] };
  const { ctx, env } = loadHost(state);
  const l = env.comp.layers.addShape(); l.selected = true;
  const r = JSON.parse(ctx.CQ.applyPreset(JSON.stringify({ preset: CQ.builder.build(presets[0], {}) })));
  assert.strictEqual(r.code, 'NO_TEXT_LAYERS'); assert.strictEqual(state.undo.length, 0);
}

// multiple layers: per-layer results
{
  const state = { issues: [], expressions: [], undo: [] };
  const { ctx, env } = loadHost(state);
  const a = env.comp.layers.addText('ONE'); a.selected = true;
  const b = env.comp.layers.addText('TWO'); b.selected = true;
  const c = env.comp.layers.addText('LOCKED'); c.selected = true; c.locked = true;
  const r = JSON.parse(ctx.CQ.applyPreset(JSON.stringify({ preset: CQ.builder.build(CQ.presets.byId('soft-type'), {}) })));
  assert.ok(r.ok); assert.strictEqual(r.results.length, 2); assert.strictEqual(r.skipped.length, 1);
  assert.strictEqual(state.undo.filter(x => x.startsWith('begin')).length, 1, 'one undo group for all layers');
}

// remove preset
{
  const state = { issues: [], expressions: [], undo: [] };
  const { ctx, env } = loadHost(state);
  const a = env.comp.layers.addText('BOXED'); a.selected = true;
  ctx.CQ.applyPreset(JSON.stringify({ preset: CQ.builder.build(CQ.presets.byId('box-tilt'), {}) }));
  assert.ok(env.comp._layers.length > 1);
  JSON.parse(ctx.CQ.removePreset());
  assert.strictEqual(env.comp._layers.length, 1, 'helper layers removed');
  assert.strictEqual(a.property('ADBE Text Properties').property('ADBE Text Animators').numProperties, 0);
}

// caption creation
{
  const state = { issues: [], expressions: [], undo: [] };
  const { ctx, env } = loadHost(state);
  const words = [{ start: 1, end: 1.4 }, { start: 1.4, end: 2 }];
  const payload = {
    captions: [{ text: 'HELLO THERE', start: 1, end: 2, highlightExpr: CQ.builder.highlightExpr(words) }, { text: 'SECOND ONE', start: 2, end: 3.5 }],
    style: { font: 'Montserrat-Bold', size: 80, fill: '#ffffff', stroke: { color: '#000000', width: 4 }, tracking: 20, justify: 'center' },
    position: [960, 900], box: { color: '#000000', opacity: 60, padX: 20, padY: 10, round: 8 },
    highlight: { color: '#ffd400' },
    shadow: { fx: 'shadow', color: '#000000', opacity: 80, distance: 4, softness: 8 },
    preset: CQ.builder.build(CQ.presets.byId('neon-word-pop'), { useFont: false, useColors: false })
  };
  const r = JSON.parse(ctx.CQ.createCaptions(JSON.stringify(payload)));
  if (!r.ok) fail('createCaptions: ' + r.message);
  else {
    assert.strictEqual(r.created, 2);
    r.layers.forEach(l => l.warnings.filter(w => !/^FONT_MISSING/.test(w)).forEach(w => fail('caption warning: ' + w)));
    const caps = env.comp._layers.filter(l => /^Caption \d+/.test(l.name));
    assert.strictEqual(caps.length, 2);
    assert.ok(caps.every(l => l.inPoint < l.outPoint));
    state.issues.forEach(i => fail('captions: ' + i));
    for (const e of state.expressions) {
      const v = valueFor(e.prop);
      try { checkExprShape(e.code, v.value, v.kind); } catch (err) { fail('caption expression on ' + e.prop.matchName + ': ' + err.message.split('\n')[0]); }
    }
  }
  // invalid caption rejected before any change
  const state2 = { issues: [], expressions: [], undo: [] };
  const h2 = loadHost(state2);
  const bad = JSON.parse(h2.ctx.CQ.createCaptions(JSON.stringify({ captions: [{ text: 'x', start: 2, end: 1 }], style: {}, position: [0, 0] })));
  assert.strictEqual(bad.code, 'BAD_CAPTION'); assert.strictEqual(state2.undo.length, 0);
}

if (failures) { console.log(failures + ' failure(s)'); process.exit(1); }
console.log('host tests passed');

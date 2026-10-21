/* Unit tests: caption grouping/timing, preset registry, builder, preview/AE parity. */
'use strict';
const assert = require('assert');
const path = require('path');
const EXT = path.join(__dirname, '..', 'extension', 'com.cyriq.cyriqcap');
require(path.join(EXT, 'js/core/expr.js'));
require(path.join(EXT, 'js/core/presets.js'));
require(path.join(EXT, 'js/core/builder.js'));
require(path.join(EXT, 'js/core/captions.js'));
const CQ = global.CQ;
const C = CQ.captions;
const { evalExpression } = require('./ae-mock');

let n = 0;
function t(name, fn) { try { fn(); n++; } catch (e) { console.log('FAIL', name, '\n ', e.message); process.exitCode = 1; } }

function words(text, gapAt) {
  let s = 0;
  return text.split(' ').map((w, i) => { if (gapAt && gapAt.includes(i)) s += 1.2; const o = { word: w, start: s, end: s + 0.3 }; s += 0.35; return o; });
}

/* ---------------- normalize */
t('normalize keeps order and fixes overlaps', () => {
  const w = C.normalize([{ start: 0, end: 2, words: [{ word: 'b', start: 0.5, end: 0.9 }, { word: 'a', start: 0.1, end: 0.6 }] }]);
  assert.deepStrictEqual(w.map(x => x.text), ['a', 'b']);
  assert.ok(w[0].end <= w[1].start + 1e-9);
});
t('normalize estimates missing word times', () => {
  const w = C.normalize([{ start: 1, end: 3, text: 'hello there world' }]);
  assert.strictEqual(w.length, 3);
  assert.ok(w.every(x => x.est));
  assert.ok(w[0].start >= 1 && w[2].end <= 3 + 1e-9);
});
t('normalize interpolates words without timestamps', () => {
  const w = C.normalize([{ start: 0, end: 3, words: [{ word: 'a', start: 0, end: 0.4 }, { word: 'b' }, { word: 'c', start: 2, end: 2.4 }] }]);
  assert.ok(isFinite(w[1].start) && w[1].start >= 0.4 && w[1].end <= 2 + 1e-6 && w[1].est);
});
t('normalize drops empty words', () => {
  assert.strictEqual(C.normalize([{ start: 0, end: 1, words: [{ word: '  ', start: 0, end: 1 }] }]).length, 0);
});

/* ---------------- grouping */
const W = C.normalize([{ start: 0, end: 10, words: words('one two three four five six seven eight nine ten eleven') }]);
for (const k of [1, 2, 4, 5]) {
  t('group ' + k, () => {
    const g = C.groupWords(W, k);
    assert.strictEqual(g.length, Math.ceil(11 / k));
    g.slice(0, -1).forEach(x => assert.strictEqual(x.words.length, k));
  });
}
t('custom grouping uses the custom value', () => { assert.strictEqual(C.groupWords(W, 'custom', { custom: 3 }).length, 4); });
t('custom grouping rejects out-of-range values', () => {
  assert.throws(() => C.groupWords(W, 'custom', { custom: 0 }));
  assert.throws(() => C.groupWords(W, 'custom', { custom: C.CUSTOM_MAX + 1 }));
  assert.throws(() => C.groupWords(W, 'custom', { custom: 'abc' }));
});
t('auto breaks at sentence end', () => {
  const w = C.normalize([{ start: 0, end: 5, words: words('Hello there. How are you?') }]);
  const g = C.groupWords(w, 'auto');
  assert.deepStrictEqual(g.map(x => x.text), ['Hello there.', 'How are you?']);
});
t('auto breaks at long pauses', () => {
  const w = C.normalize([{ start: 0, end: 9, words: words('a b c d e f', [3]) }]);
  assert.deepStrictEqual(C.groupWords(w, 'auto').map(x => x.text), ['a b c', 'd e f']);
});
t('auto respects max characters', () => {
  const w = C.normalize([{ start: 0, end: 20, words: words('alpha bravo charlie delta echo foxtrot golf hotel india juliet') }]);
  C.groupWords(w, 'auto', { maxChars: 18 }).forEach(x => assert.ok(x.text.length <= 18, x.text));
});
t('auto is deterministic', () => {
  assert.deepStrictEqual(C.groupWords(W, 'auto'), C.groupWords(W, 'auto'));
});

/* ---------------- timing */
t('fitTiming offsets, clamps and orders', () => {
  const g = [{ text: 'b', start: 5, end: 6, words: [] }, { text: 'a', start: -1, end: 0.5, words: [] }, { text: 'out', start: 50, end: 51, words: [] }];
  const f = C.fitTiming(g, { offset: 2, compStart: 2, compEnd: 9, fps: 25 });
  assert.deepStrictEqual(f.map(x => x.text), ['a', 'b']);
  assert.ok(f[0].start >= 2 && f[1].end <= 9);
});
t('fitTiming removes overlaps and enforces a minimum duration', () => {
  const g = [{ text: 'a', start: 0, end: 2, words: [] }, { text: 'b', start: 1.5, end: 1.51, words: [] }];
  const f = C.fitTiming(g, { fps: 30 });
  assert.ok(f[0].end <= f[1].start + 1e-9, 'no overlap');
  assert.ok(f[1].end - f[1].start >= 2 / 30 - 1e-9, 'min length');
});
t('fitTiming snaps to frames', () => {
  const f = C.fitTiming([{ text: 'x', start: 0.1234, end: 1.2345, words: [] }], { fps: 24 });
  assert.ok(Math.abs(f[0].start * 24 - Math.round(f[0].start * 24)) < 1e-6);
});
t('fitTiming handles time stretch', () => {
  const f = C.fitTiming([{ text: 'x', start: 1, end: 2, words: [] }], { stretch: 200, fps: 100, tail: 0 });
  assert.ok(Math.abs(f[0].start - 2) < 1e-6 && Math.abs(f[0].end - 4) < 1e-6);
});
t('auto never ends a caption on a weak word when it can avoid it', () => {
  const w = C.normalize([{ start: 0, end: 12, words: words('I am going to show you how to edit the clip and then we will add some captions to the video today') }]);
  const g = C.groupWords(w, 'auto', { maxChars: 24 });
  g.slice(0, -1).forEach(x => assert.ok(!C.isWeak(x.words[x.words.length - 1].text), x.text));
  g.forEach(x => assert.ok(x.text.length <= 24, x.text));
});
t('fixed word count does not cross a sentence end', () => {
  const w = C.normalize([{ start: 0, end: 5, words: words('One two. Three four five') }]);
  assert.deepStrictEqual(C.groupWords(w, 4).map(x => x.text), ['One two.', 'Three four five']);
});
t('captions end at speech end and leave pauses empty', () => {
  const g = [{ text: 'a', start: 1, end: 2, words: [] }, { text: 'b', start: 4, end: 5, words: [] }];
  const f = C.fitTiming(g, { fps: 25 });
  assert.ok(f[0].end < 2.2 && f[1].start >= 4 - 1e-9, JSON.stringify(f));
});
t('speech regions and word snapping', () => {
  const rate = 16000, s = new Int16Array(rate * 3);
  for (let i = 0; i < s.length; i++) { const t = i / rate; s[i] = (t > 1 && t < 2 ? 8000 * Math.sin(i * 0.3) : (Math.random() - 0.5) * 20) | 0; }
  const r = C.speechRegions(s, rate);
  assert.strictEqual(r.length, 1);
  assert.ok(Math.abs(r[0].start - 1) < 0.05 && Math.abs(r[0].end - 2) < 0.07, JSON.stringify(r));
  const w = C.snapWords([{ text: 'hi', start: 0.7, end: 2.4 }], r);
  assert.ok(Math.abs(w[0].start - r[0].start) < 1e-9 && Math.abs(w[0].end - r[0].end) < 1e-9);
});
t('balanced two-line wrap', () => {
  const t2 = C.wrapLines('this is a fairly long caption line here', 24, 2).split('\r');
  assert.strictEqual(t2.length, 2);
  assert.ok(Math.abs(t2[0].length - t2[1].length) < 8);
});
t('time parse/format round trip', () => {
  assert.strictEqual(C.fmtTime(65.5), '01:05.50');
  assert.strictEqual(C.fmtTime(65.5, 30), '01:05:15');
  assert.ok(Math.abs(C.parseTime('01:05:15', 30) - 65.5) < 1e-9);
  assert.ok(Math.abs(C.parseTime('01:05.50') - 65.5) < 1e-9);
  assert.strictEqual(C.parseTime('12.25'), 12.25);
  assert.ok(isNaN(C.parseTime('abc')));
});
t('retime keeps word count in sync with edited text', () => {
  const c = { text: 'hello big world', start: 1, end: 2, words: [{ text: 'hello', start: 1, end: 1.5 }, { text: 'world', start: 1.5, end: 2 }] };
  const w = C.retime(c);
  assert.strictEqual(w.length, 3);
  assert.ok(w[0].start >= 1 && w[2].end <= 2 + 1e-9);
});
t('wrapLines', () => { assert.strictEqual(C.wrapLines('aaa bbb ccc', 7), 'aaa bbb\rccc'); });

/* ---------------- presets + builder */
t('65 valid presets with unique ids', () => {
  const ids = new Set();
  CQ.presets.list.forEach(p => { assert.deepStrictEqual(CQ.presets.validate(p), [], p.id); assert.ok(!ids.has(p.id)); ids.add(p.id); });
  assert.strictEqual(CQ.presets.list.length, 65);
});
t('builder respects options', () => {
  const p = CQ.presets.byId('tint-sweep-gold');
  const a = CQ.builder.build(p, {});
  const b = CQ.builder.build(p, { useFont: false, useColors: false, fill: '#123456' });
  assert.strictEqual(a.style.font, 'Rubik-Bold');
  assert.strictEqual(b.style.font, undefined);
  assert.ok(a.anims.some(x => x.props.fill));
  assert.ok(!b.anims.some(x => x.props.fill), 'colour animators dropped when preset colours are off');
  assert.strictEqual(b.style.fill, '#123456');
});
t('speed scales timing', () => {
  const p = CQ.presets.byId('soft-type');
  const slow = CQ.builder.build(p, { speed: 0.5 }).anims[0].expr;
  const fast = CQ.builder.build(p, { speed: 2 }).anims[0].expr;
  assert.ok(/D=1\.4/.test(slow) && /D=0\.35/.test(fast));
});
t('preview and After Effects (keyframe-driven) use identical timing', () => {
  CQ.presets.list.forEach(p => {
    const built = CQ.builder.build(p, {});
    const env = { ae: true, inT: built.timing.inT, outT: built.timing.outT, src: 'self' };
    CQ.presets.normalize(p).forEach(a => {
      const ae = CQ.expr.selectorExpression(a.t, env);
      const pv = CQ.expr.compileAmount(a.t);
      for (const time of [0.13, 0.27, 0.53, 0.97, 1.61, 2.37, 4.43, 6.07, 7.31, 7.87]) for (const i of [1, 4, 8]) {
        const r = evalExpression(ae, { env: { time, textIndex: i, textTotal: 8, inPoint: 0.1, outPoint: 8, inT: env.inT, outT: env.outT } });
        const v = pv(i, 8, time, 0.1, 8);
        assert.ok(Math.abs(r[0] / 100 - v) < 0.02, p.id + ' mismatch at t=' + time + ' i=' + i);
      }
    });
  });
});
t('in-animation starts hidden and ends at rest', () => {
  CQ.presets.list.forEach(p => {
    CQ.presets.normalize(p).forEach(a => {
      const tt = a.t || {};
      if (tt.phase !== 'both' && tt.phase !== 'in') return;
      if (tt.sign || tt.select || tt.jitter || tt.wiggle) return;
      const f = CQ.expr.compileAmount(tt);
      assert.ok(Math.abs(f(1, 5, 0, 0.5, 30) - 1) < 1e-6, p.id + ' not hidden before in-point');
      assert.ok(Math.abs(f(3, 5, 15, 0.5, 30)) < 1e-6, p.id + ' not at rest in the middle');
    });
  });
});
t('every preset gets in/out keyframe timing', () => {
  CQ.presets.list.forEach(p => { const b = CQ.builder.build(p, {}); assert.ok(b.timing.inT > 0 && b.timing.outT > 0, p.id); b.anims.forEach(a => assert.ok(/effect\("CQ In"\)/.test(a.expr), p.id + ' animator not keyframe-driven')); });
});
t('highlight expression selects the current word', () => {
  const e = CQ.builder.highlightExpr([{ start: 1, end: 2 }, { start: 2, end: 3 }]);
  assert.deepStrictEqual(evalExpression(e, { env: { time: 1.5, textIndex: 1 } }), [100, 100, 100]);
  assert.deepStrictEqual(evalExpression(e, { env: { time: 1.5, textIndex: 2 } }), [0, 0, 0]);
});

console.log('unit tests passed: ' + n);

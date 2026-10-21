/*
 * A small mock of the After Effects scripting DOM, enough to execute
 * jsx/host.jsx in Node. It checks every match name we add against a list of
 * known After Effects match names, records values, and evaluates every
 * expression we set in an expression-like environment so syntax/runtime
 * errors are caught without After Effects.
 */
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

// Known match names (After Effects 2019+)
const TEXT_ANIMATOR_PROPS = new Set([
  'ADBE Text Anchor Point 3D', 'ADBE Text Position 3D', 'ADBE Text Scale 3D', 'ADBE Text Skew', 'ADBE Text Skew Axis',
  'ADBE Text Rotation', 'ADBE Text Rotation X', 'ADBE Text Rotation Y', 'ADBE Text Opacity', 'ADBE Text Fill Color',
  'ADBE Text Fill Opacity', 'ADBE Text Stroke Color', 'ADBE Text Stroke Opacity', 'ADBE Text Stroke Width', 'ADBE Text Track Type',
  'ADBE Text Tracking Amount', 'ADBE Text Line Spacing', 'ADBE Text Character Change Type', 'ADBE Text Character Replace',
  'ADBE Text Character Offset', 'ADBE Text Blur', 'ADBE Text Line Anchor'
]);
const EFFECTS = {
  'ADBE Glo2': 14, 'ADBE Ramp': 7, 'ADBE Drop Shadow': 6, 'ADBE Bevel Alpha': 4, 'ADBE Mosaic': 3, 'ADBE Wave Warp': 8,
  'CC Burn Film': 3, 'ADBE Linear Wipe': 3, 'ADBE Fill': 7, 'ADBE Gaussian Blur 2': 3, 'ADBE Slider Control': 1
};
// effects whose params we address by display name
const NAMED_PARAMS = {
  'ADBE Fractal Noise': ['Fractal Type', 'Noise Type', 'Invert', 'Contrast', 'Brightness', 'Overflow', 'Scale', 'Complexity', 'Evolution', 'Opacity', 'Blending Mode'],
  'ADBE Shatter': ['View', 'Render', 'Pattern', 'Repetitions', 'Direction', 'Origin', 'Extrusion Depth', 'Position', 'Depth', 'Radius', 'Strength', 'Gravity']
};
const PLUGIN_EFFECTS = [
  { d: 'Deep Glow', m: 'PEDG', c: 'Plugin Everything' },
  { d: 'S_TextureNoiseEmboss', m: 'S_TextureNoiseEmboss', c: 'Sapphire Render' },
  { d: 'S_TextureSpots', m: 'S_TextureSpots', c: 'Sapphire Render' },
  { d: 'S_TextureCells', m: 'S_TextureCells', c: 'Sapphire Render' },
  { d: 'S_EmbossShiny', m: 'S_EmbossShiny', c: 'Sapphire Stylize' },
  { d: 'BCC Rays Puffy', m: 'BCC Rays Puffy', c: 'BCC Lights' }
];

class ExprError extends Error {}

function makeEnv(state) {
  const issues = state.issues;
  const expressions = state.expressions;

  class Property {
    constructor(name, matchName, parent, value, kind) {
      this.name = name; this.matchName = matchName; this.parentProperty = parent; this._value = value; this._expr = '';
      this.propertyType = kind || 'PROPERTY'; this.numProperties = 0; this._children = [];
    }
    get value() { return this._value; }
    get numKeys() { return (this._keys || []).length; }
    setValueAtTime(t, v) { if (!isFinite(t) || !isFinite(v)) throw new Error('bad key'); this._keys = this._keys || []; this._keys.push([t, v]); this._keys.sort((x, y) => x[0] - y[0]); }
    setInterpolationTypeAtKey(i) { if (!this._keys || i < 1 || i > this._keys.length) throw new Error('bad key index'); }
    valueAtTime(t) { const k = this._keys; if (!k || !k.length) return this._value; if (t <= k[0][0]) return k[0][1]; if (t >= k[k.length - 1][0]) return k[k.length - 1][1]; for (let i = 0; i < k.length - 1; i++) if (t <= k[i + 1][0]) return k[i][1] + (k[i + 1][1] - k[i][1]) * (t - k[i][0]) / (k[i + 1][0] - k[i][0]); }
    setValue(v) {
      if (v === undefined || (typeof v === 'number' && !isFinite(v))) throw new Error('bad value for ' + this.matchName);
      if (Array.isArray(v) && v.some(x => typeof x !== 'number' || !isFinite(x))) throw new Error('bad array value for ' + this.matchName);
      this._value = v;
    }
    get expression() { return this._expr; }
    set expression(e) { this._expr = e; if (e) expressions.push({ prop: this, code: e, owner: state.currentLayer }); }
    property(k) {
      if (typeof k === 'number') return this._children[k - 1] || null;
      return this._children.find(c => c.matchName === k || c.name === k) || null;
    }
    _add(child) { this._children.push(child); this.numProperties = this._children.length; return child; }
    addProperty(m) { return this._addProperty(m); }
    _addProperty(m) { throw new Error('cannot add ' + m + ' to ' + this.matchName); }
    remove() { const p = this.parentProperty; p._children.splice(p._children.indexOf(this), 1); p.numProperties = p._children.length; }
  }

  class Group extends Property {
    constructor(name, matchName, parent, allowed) { super(name, matchName, parent, null, 'NAMED_GROUP'); this.allowed = allowed; }
    _addProperty(m) {
      const f = this.allowed && this.allowed(m, this);
      if (!f) { issues.push('Unknown match name "' + m + '" added to ' + this.matchName); throw new Error('Unknown match name ' + m); }
      return this._add(f);
    }
  }

  function effect(m, parent) {
    if (EFFECTS[m]) {
      const g = new Group(m, m, parent, null);
      for (let i = 1; i <= EFFECTS[m]; i++) g._add(new Property(m + ' p' + i, m + '-' + String(i).padStart(4, '0'), g, 0));
      return g;
    }
    if (NAMED_PARAMS[m]) {
      const g = new Group(m, m, parent, null);
      NAMED_PARAMS[m].forEach((n, i) => g._add(new Property(n, m + '-' + String(i + 1).padStart(4, '0'), g, 0)));
      return g;
    }
    const pe = PLUGIN_EFFECTS.find(p => p.m === m);
    if (pe) { const g = new Group(pe.d, m, parent, null); ['Radius', 'Exposure', 'Amount'].forEach(n => g._add(new Property(n, m + '-' + n, g, 0))); return g; }
    return null;
  }

  function animator(parent) {
    const a = new Group('Animator', 'ADBE Text Animator', parent, null);
    a._add(new Group('Selectors', 'ADBE Text Selectors', a, (m, g) => {
      if (m === 'ADBE Text Expressible Selector') {
        const s = new Group('Expression Selector', m, g, null);
        s._add(new Property('Based On', 'ADBE Text Range Type2', s, 1));
        s._add(new Property('Amount', 'ADBE Text Expressible Amount', s, [100, 100, 100]));
        s._kind = 'selector';
        return s;
      }
      if (m === 'ADBE Text Selector') return new Group('Range Selector', m, g, null);
      return null;
    }));
    a._add(new Group('Properties', 'ADBE Text Animator Properties', a, (m, g) => {
      if (!TEXT_ANIMATOR_PROPS.has(m)) return null;
      const p = new Property(m, m, g, 0);
      if (m === 'ADBE Text Character Replace' || m === 'ADBE Text Character Offset') {
        if (!g.property('ADBE Text Character Change Type')) g._add(new Property('Character Alignment', 'ADBE Text Character Change Type', g, 1));
      }
      return p;
    }));
    return a;
  }

  function vectorGroup(parent) {
    const allowed = (m, g) => {
      if (m === 'ADBE Vector Group') return vectorGroup(g);
      if (m === 'ADBE Vector Shape - Rect') { const r = new Group('Rect', m, g, null); ['ADBE Vector Rect Size', 'ADBE Vector Rect Position', 'ADBE Vector Rect Roundness'].forEach(x => r._add(new Property(x, x, r, 0))); return r; }
      if (m === 'ADBE Vector Shape - Group') { const r = new Group('Path', m, g, null); r._add(new Property('Path', 'ADBE Vector Shape', r, null)); r._kind = 'path'; return r; }
      if (m === 'ADBE Vector Graphic - Fill') { const r = new Group('Fill', m, g, null); ['ADBE Vector Fill Color', 'ADBE Vector Fill Opacity'].forEach(x => r._add(new Property(x, x, r, 0))); return r; }
      if (m === 'ADBE Vector Graphic - Stroke') {
        const r = new Group('Stroke', m, g, null);
        ['ADBE Vector Stroke Color', 'ADBE Vector Stroke Width', 'ADBE Vector Stroke Line Cap'].forEach(x => r._add(new Property(x, x, r, 0)));
        r._add(new Group('Dashes', 'ADBE Vector Stroke Dashes', r, (mm, gg) => (mm === 'ADBE Vector Stroke Dash 1' || mm === 'ADBE Vector Stroke Gap 1') ? new Property(mm, mm, gg, 0) : null));
        return r;
      }
      if (m === 'ADBE Vector Filter - Trim') { const r = new Group('Trim', m, g, null); ['ADBE Vector Trim Start', 'ADBE Vector Trim End', 'ADBE Vector Trim Offset'].forEach(x => r._add(new Property(x, x, r, 0))); return r; }
      return null;
    };
    if (parent && parent.matchName === 'ADBE Root Vectors Group') return new Group('Group', 'ADBE Vector Group', parent, null)._withContents(allowed);
    const g = new Group('Group', 'ADBE Vector Group', parent, null);
    g._add(new Group('Contents', 'ADBE Vectors Group', g, allowed));
    return g;
  }
  Group.prototype._withContents = function (allowed) { this._add(new Group('Contents', 'ADBE Vectors Group', this, allowed)); return this; };

  class TextDocument {
    constructor(t) { this.text = t; this.font = 'ArialMT'; this.fontSize = 72; this.applyFill = true; this.fillColor = [1, 1, 1]; this.applyStroke = false; this.strokeColor = [0, 0, 0]; this.strokeWidth = 1; this.tracking = 0; this.justification = 7415; this.autoLeading = true; this.leading = 0; this.allCaps = false; }
  }

  let nextId = 100;
  class Layer {
    constructor(comp, name, kind) {
      this.containingComp = comp; this.name = name; this.id = nextId++; this.comment = ''; this.locked = false; this.inPoint = 0; this.outPoint = comp.duration; this.startTime = 0; this.stretch = 100;
      this.parent = null; this.motionBlur = false; this._kind = kind;
      this._root = new Group(name, 'ADBE Root', null, null);
      const tr = new Group('Transform', 'ADBE Transform Group', this._root, null);
      ['ADBE Anchor Point', 'ADBE Position', 'ADBE Scale', 'ADBE Rotate Z', 'ADBE Opacity'].forEach(m => tr._add(new Property(m, m, tr, m === 'ADBE Scale' ? [100, 100] : m === 'ADBE Opacity' ? 100 : m === 'ADBE Rotate Z' ? 0 : [0, 0])));
      this._root._add(tr);
      this._root._add(new Group('Effects', 'ADBE Effect Parade', this._root, (m, g) => effect(m, g)));
      this._root._add(new Group('Masks', 'ADBE Mask Parade', this._root, (m, g) => {
        if (m !== 'ADBE Mask Atom') return null;
        const mk = new Group('Mask', m, g, null); mk._add(new Property('Mask Path', 'ADBE Mask Shape', mk, null)); return mk;
      }));
    }
    property(k) { return this._root.property(k); }
    get index() { return this.containingComp._layers.indexOf(this) + 1; }
    moveAfter(l) { const a = this.containingComp._layers; a.splice(a.indexOf(this), 1); a.splice(a.indexOf(l) + 1, 0, this); }
    moveBefore(l) { const a = this.containingComp._layers; a.splice(a.indexOf(this), 1); a.splice(a.indexOf(l), 0, this); }
    remove() { const a = this.containingComp._layers; a.splice(a.indexOf(this), 1); }
    sourceRectAtTime() { return { left: -300, top: -80, width: 600, height: 100 }; }
  }
  class AVLayer extends Layer {}
  class TextLayer extends AVLayer {
    constructor(comp, text) {
      super(comp, text, 'text');
      const tp = new Group('Text', 'ADBE Text Properties', this._root, null);
      tp._add(new Property('Source Text', 'ADBE Text Document', tp, new TextDocument(text)));
      tp._add(new Group('Animators', 'ADBE Text Animators', tp, (m, g) => m === 'ADBE Text Animator' ? animator(g) : null));
      const mo = new Group('More Options', 'ADBE Text More Options', tp, null);
      mo._add(new Property('Grouping Alignment', 'ADBE Text Anchor Point Align', mo, [0, 0]));
      tp._add(mo);
      this._root._add(tp);
    }
    duplicate() {
      const d = new TextLayer(this.containingComp, this.name);
      d.property('ADBE Text Properties').property('ADBE Text Document')._value = Object.assign(new TextDocument(''), this.property('ADBE Text Properties').property('ADBE Text Document').value);
      const a = this.containingComp._layers; a.splice(a.indexOf(this), 0, d);
      return d;
    }
  }
  class ShapeLayer extends AVLayer {
    constructor(comp) { super(comp, 'Shape Layer', 'shape'); this._root._add(new Group('Contents', 'ADBE Root Vectors Group', this._root, (m, g) => m === 'ADBE Vector Group' ? vectorGroup(g) : null)); }
  }
  class CameraLayer extends Layer {}
  class LightLayer extends Layer {}
  class CompItem {
    constructor() { this.id = 1; this.name = 'Comp 1'; this.width = 1920; this.height = 1080; this.duration = 10; this.frameRate = 30; this.frameDuration = 1 / 30; this.time = 0; this._layers = []; this.motionBlur = false; this.workAreaStart = 0; this.workAreaDuration = 10;
      const self = this;
      this.layers = {
        addText(t) { const l = new TextLayer(self, t); self._layers.unshift(l); return l; },
        addShape() { const l = new ShapeLayer(self); self._layers.unshift(l); return l; }
      };
    }
    get numLayers() { return this._layers.length; }
    layer(i) { return this._layers[i - 1]; }
    get selectedLayers() { return this._layers.filter(l => l.selected); }
  }
  class FootageItem {}
  class SolidSource {}
  class Shape { constructor() { this.vertices = []; this.closed = false; } }

  const comp = new CompItem();
  const app = {
    project: { activeItem: comp },
    version: '16.1.0',
    isoLanguage: 'en_US',
    effects: Object.keys(EFFECTS).concat(Object.keys(NAMED_PARAMS)).map(m => ({ displayName: m, matchName: m, category: 'Built-in' })).concat(state.plugins ? PLUGIN_EFFECTS.map(p => ({ displayName: p.d, matchName: p.m, category: p.c })) : []),
    undo: 0,
    beginUndoGroup(n) { state.undo.push('begin:' + n); },
    endUndoGroup() { state.undo.push('end'); }
  };
  return { app, comp, CompItem, TextLayer, ShapeLayer, AVLayer, CameraLayer, LightLayer, FootageItem, SolidSource, Shape, PropertyType: { PROPERTY: 'PROPERTY', NAMED_GROUP: 'NAMED_GROUP', INDEXED_GROUP: 'INDEXED_GROUP' }, ParagraphJustification: { LEFT_JUSTIFY: 7413, CENTER_JUSTIFY: 7415, RIGHT_JUSTIFY: 7414 }, KeyframeInterpolationType: { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 }, File: function () {}, $: { os: 'Windows' } };
}

/** Evaluate an expression the way After Effects does (value of the last statement). */
function evalExpression(code, ctx) {
  const env = Object.assign({
    time: 1.2, inPoint: 0.15, outPoint: 4, value: ctx.value,
    textIndex: 3, textTotal: 9, selectorValue: [100, 100, 100],
    thisComp: { height: 1080, width: 1920 },
    createPath(points, inT, outT, closed) {
      if (!Array.isArray(points) || points.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !isFinite(v)))) throw new ExprError('createPath: bad points');
      return { points, closed };
    },
    sourceRectAtTime() { return { left: -300, top: -80, width: 600, height: 100 }; }
  }, ctx.env || {});
  if (!env.effect) {
    // default timing sliders: In keyed over 0.75 s from the in-point, Out over the last 0.5 s
    const cl = v => v < 0 ? 0 : v > 1 ? 1 : v;
    const inT = env.inT || 0.75, outT = env.outT || 0.5;
    env.effect = name => {
      if (name === 'CQ In') return () => cl((env.time - env.inPoint) / inT) * 100;
      if (name === 'CQ Out') return () => cl((env.time - (env.outPoint - outT)) / outT) * 100;
      throw new ExprError('effect "' + name + '" not found');
    };
  }
  env.thisLayer = { sourceRectAtTime: env.sourceRectAtTime, effect: env.effect, parent: { sourceRectAtTime: env.sourceRectAtTime, effect: env.effect }, inPoint: env.inPoint, outPoint: env.outPoint };
  const fn = new Function('env', '__code', 'with (env) { return eval(__code); }');
  return fn(env, code);
}

function loadHost(state) {
  const env = makeEnv(state);
  const ctx = vm.createContext(Object.assign({}, env));
  const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'com.cyriq.cyriqcap', 'jsx', 'host.jsx'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'host.jsx' });
  return { ctx, env };
}

module.exports = { loadHost, evalExpression, ExprError, PLUGIN_EFFECTS };

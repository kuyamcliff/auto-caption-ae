/*
 * CyriqCap - After Effects host script (ExtendScript, ES3).
 *
 * All functions take/return JSON strings so the panel never has to build
 * ExtendScript source from user text. Every project change runs inside a
 * single undo group so one Ctrl+Z reverts it.
 *
 * Supported: After Effects 2019 (16.0) and later.
 */

/* ------------------------------------------------------------------ */
/* Minimal JSON (ExtendScript has no native JSON)                       */
/* ------------------------------------------------------------------ */
var CQJSON = (function () {
  function esc(s) {
    var out = '', i, c, code;
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i); code = s.charCodeAt(i);
      if (c === '"' || c === '\\') out += '\\' + c;
      else if (c === '\n') out += '\\n';
      else if (c === '\r') out += '\\r';
      else if (c === '\t') out += '\\t';
      else if (code < 32 || code > 126) { var h = code.toString(16); while (h.length < 4) h = '0' + h; out += '\\u' + h; }
      else out += c;
    }
    return out;
  }
  function stringify(v) {
    var t = typeof v, i, parts, k;
    if (v === null || v === undefined) return 'null';
    if (t === 'number') return isFinite(v) ? String(v) : 'null';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'string') return '"' + esc(v) + '"';
    if (v instanceof Array) {
      parts = [];
      for (i = 0; i < v.length; i++) parts.push(stringify(v[i]));
      return '[' + parts.join(',') + ']';
    }
    if (t === 'object') {
      parts = [];
      for (k in v) if (v.hasOwnProperty(k) && typeof v[k] !== 'function') parts.push('"' + esc(k) + '":' + stringify(v[k]));
      return '{' + parts.join(',') + '}';
    }
    return 'null';
  }
  function parse(src) {
    var at = 0, ch = ' ';
    function err(m) { throw new Error('JSON ' + m + ' at ' + at); }
    function next() { ch = src.charAt(at); at++; return ch; }
    function white() { while (ch && ch <= ' ') next(); }
    function string() {
      var s = '', u, h, i;
      if (ch !== '"') err('expected string');
      while (next()) {
        if (ch === '"') { next(); return s; }
        if (ch === '\\') {
          next();
          if (ch === 'u') { u = 0; for (i = 0; i < 4; i++) { h = parseInt(next(), 16); if (!isFinite(h)) err('bad unicode'); u = u * 16 + h; } s += String.fromCharCode(u); }
          else if (ch === 'n') s += '\n'; else if (ch === 'r') s += '\r'; else if (ch === 't') s += '\t';
          else if (ch === 'b') s += '\b'; else if (ch === 'f') s += '\f'; else s += ch;
        } else s += ch;
      }
      err('unterminated string');
    }
    function number() {
      var s = '';
      if (ch === '-') { s = '-'; next(); }
      while ((ch >= '0' && ch <= '9') || ch === '.' || ch === 'e' || ch === 'E' || ch === '+' || ch === '-') { s += ch; next(); }
      var n = Number(s); if (!isFinite(n)) err('bad number'); return n;
    }
    function word() {
      if (src.substr(at - 1, 4) === 'true') { at += 3; next(); return true; }
      if (src.substr(at - 1, 5) === 'false') { at += 4; next(); return false; }
      if (src.substr(at - 1, 4) === 'null') { at += 3; next(); return null; }
      err('unexpected ' + ch);
    }
    function value() {
      white();
      if (ch === '{') {
        var o = {}; next(); white();
        if (ch === '}') { next(); return o; }
        while (ch) { var key = string(); white(); if (ch !== ':') err('expected :'); next(); o[key] = value(); white(); if (ch === '}') { next(); return o; } if (ch !== ',') err('expected ,'); next(); white(); }
        err('bad object');
      }
      if (ch === '[') {
        var a = []; next(); white();
        if (ch === ']') { next(); return a; }
        while (ch) { a.push(value()); white(); if (ch === ']') { next(); return a; } if (ch !== ',') err('expected ,'); next(); }
        err('bad array');
      }
      if (ch === '"') return string();
      if (ch === '-' || (ch >= '0' && ch <= '9')) return number();
      return word();
    }
    var r = value(); white(); if (ch) err('trailing data');
    return r;
  }
  return { stringify: stringify, parse: parse };
})();

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
var CQ = {};
CQ.VERSION = '1.0.0';
CQ.TAG = 'CQ ';            // prefix for animators/effects/layers we create

CQ.ok = function (data) { var r = { ok: true }; for (var k in data) if (data.hasOwnProperty(k)) r[k] = data[k]; return CQJSON.stringify(r); };
CQ.fail = function (code, message, extra) { var r = { ok: false, code: code, message: message }; if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) r[k] = extra[k]; return CQJSON.stringify(r); };

CQ.activeComp = function () {
  var it = app.project ? app.project.activeItem : null;
  return (it && it instanceof CompItem) ? it : null;
};

CQ.hexToRgb = function (h) {
  if (h instanceof Array) return [h[0] / 255, h[1] / 255, h[2] / 255];
  var s = String(h || '#ffffff').replace('#', '');
  if (s.length === 3) s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
  var n = parseInt(s, 16);
  if (isNaN(n)) n = 0xffffff;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

CQ.layerKind = function (l) {
  try {
    if (l instanceof TextLayer) return 'text';
    if (l instanceof ShapeLayer) return 'shape';
    if (l instanceof CameraLayer) return 'camera';
    if (l instanceof LightLayer) return 'light';
    if (l instanceof AVLayer) {
      var src = l.source;
      if (src instanceof CompItem) return 'precomp';
      if (src && src.mainSource && src.mainSource instanceof SolidSource) return 'solid';
      if (l.nullLayer) return 'null';
      if (src instanceof FootageItem) {
        if (src.hasVideo && src.hasAudio) return 'video-audio';
        if (src.hasAudio) return 'audio';
        if (src.hasVideo) return 'video';
      }
      return 'av';
    }
  } catch (e) {}
  return 'other';
};

CQ.safeSet = function (prop, value, warnings, label) {
  try { prop.setValue(value); return true; } catch (e) { if (warnings) warnings.push((label || prop.name) + ': ' + e.message); return false; }
};

CQ.setExpr = function (prop, expr, warnings, label) {
  try { prop.expression = expr; return true; } catch (e) { if (warnings) warnings.push((label || prop.name) + ' expression: ' + e.message); return false; }
};

/** Effect parameter by match-name suffix index, then by English display name. */
CQ.fxParam = function (effect, index, name) {
  var p = null;
  try { p = effect.property(effect.matchName + '-' + (index < 10 ? '000' : '00') + index); } catch (e) { p = null; }
  if (!p && name) { try { p = effect.property(name); } catch (e2) { p = null; } }
  if (!p && index) { try { p = effect.property(index); } catch (e3) { p = null; } }
  return p;
};

CQ.findParamByName = function (group, name) {
  var i, p;
  try {
    for (i = 1; i <= group.numProperties; i++) {
      p = group.property(i);
      if (p.name === name || p.matchName === name) return p;
      if (p.propertyType !== PropertyType.PROPERTY) {
        var r = CQ.findParamByName(p, name);
        if (r) return r;
      }
    }
  } catch (e) {}
  return null;
};

CQ.escName = function (s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); };

/* ------------------------------------------------------------------ */
/* Selection                                                            */
/* ------------------------------------------------------------------ */
CQ.describeLayer = function (l, comp) {
  var d = { index: l.index, name: l.name, kind: CQ.layerKind(l), inPoint: l.inPoint, outPoint: l.outPoint, startTime: l.startTime, stretch: l.stretch, locked: l.locked };
  try { d.timeRemap = l.timeRemapEnabled === true; } catch (e) {}
  try { d.audioEnabled = l.audioEnabled === true; } catch (e2) {}
  try {
    if (l.source instanceof FootageItem && l.source.file) { d.file = l.source.file.fsName; d.fileExists = l.source.file.exists; }
    if (l.source) { d.hasAudio = l.source.hasAudio === true; d.sourceId = l.source.id; }
  } catch (e3) {}
  if (d.kind === 'text') {
    try { var doc = l.property('ADBE Text Properties').property('ADBE Text Document').value; d.text = doc.text; d.font = doc.font; d.fontSize = doc.fontSize; } catch (e4) {}
    d.cqPreset = CQ.readTag(l);
  }
  return d;
};

CQ.readTag = function (l) {
  try { var m = /CyriqCap:([a-z0-9-]+)/.exec(l.comment || ''); return m ? m[1] : null; } catch (e) { return null; }
};

CQ.getSelection = function () {
  try {
    var comp = CQ.activeComp();
    if (!comp) return CQ.ok({ comp: null, layers: [] });
    var layers = [], sel = comp.selectedLayers, i;
    for (i = 0; i < sel.length; i++) layers.push(CQ.describeLayer(sel[i], comp));
    return CQ.ok({
      comp: { id: comp.id, name: comp.name, width: comp.width, height: comp.height, duration: comp.duration, frameRate: comp.frameRate, time: comp.time, workStart: comp.workAreaStart, workDuration: comp.workAreaDuration },
      layers: layers,
      aeVersion: app.version
    });
  } catch (e) {
    return CQ.fail('SELECTION', e.message);
  }
};

/* ------------------------------------------------------------------ */
/* Plug-ins and fonts                                                   */
/* ------------------------------------------------------------------ */
CQ._effectList = null;
CQ.listEffects = function () {
  if (CQ._effectList) return CQ._effectList;
  var out = [];
  try {
    var fx = app.effects, i;
    for (i = 0; i < fx.length; i++) out.push({ d: fx[i].displayName, m: fx[i].matchName, c: fx[i].category });
  } catch (e) {}
  CQ._effectList = out;
  return out;
};

CQ.findEffect = function (needles) {
  var list = CQ.listEffects(), i, j, d, m;
  for (j = 0; j < needles.length; j++) {
    var n = String(needles[j]).toLowerCase();
    for (i = 0; i < list.length; i++) {
      d = String(list[i].d).toLowerCase(); m = String(list[i].m).toLowerCase();
      if (d === n || m === n) return list[i];
    }
  }
  for (j = 0; j < needles.length; j++) {
    var n2 = String(needles[j]).toLowerCase();
    for (i = 0; i < list.length; i++) {
      d = String(list[i].d).toLowerCase(); m = String(list[i].m).toLowerCase();
      if (d.indexOf(n2) >= 0 || m.indexOf(n2) >= 0) return list[i];
    }
  }
  return null;
};

/** payload: {plugins:{key:[needles]}} -> {found:{key:bool}, effectCount} */
CQ.checkPlugins = function (json) {
  try {
    var p = CQJSON.parse(json), found = {}, k;
    for (k in p.plugins) if (p.plugins.hasOwnProperty(k)) found[k] = CQ.findEffect(p.plugins[k]) ? true : false;
    return CQ.ok({ found: found, effectCount: CQ.listEffects().length });
  } catch (e) { return CQ.fail('PLUGINS', e.message); }
};

/** Fonts installed in After Effects (only AE 24+ exposes this list). */
CQ.listFonts = function () {
  try {
    if (!app.fonts || !app.fonts.allFonts) return CQ.ok({ supported: false, fonts: [] });
    var groups = app.fonts.allFonts, out = [], i, j, seen = {};
    for (i = 0; i < groups.length; i++) {
      for (j = 0; j < groups[i].length; j++) {
        var f = groups[i][j];
        if (seen[f.postScriptName]) continue;
        seen[f.postScriptName] = 1;
        out.push({ ps: f.postScriptName, family: f.familyName, style: f.styleName });
      }
    }
    return CQ.ok({ supported: true, fonts: out });
  } catch (e) { return CQ.ok({ supported: false, fonts: [], message: e.message }); }
};

/* ------------------------------------------------------------------ */
/* Text styling                                                         */
/* ------------------------------------------------------------------ */
CQ.styleText = function (layer, st, scale, warnings) {
  var srcProp = layer.property('ADBE Text Properties').property('ADBE Text Document');
  var doc = srcProp.value;
  var requested = st.font;
  try { if (st.font) doc.font = st.font; } catch (e) { warnings.push('font: ' + e.message); }
  if (st.size) doc.fontSize = Math.max(1, st.size * scale);
  if (st.fill) { doc.applyFill = true; doc.fillColor = CQ.hexToRgb(st.fill); }
  if (st.stroke && st.stroke.width > 0) {
    doc.applyStroke = true;
    doc.strokeColor = CQ.hexToRgb(st.stroke.color || '#000000');
    doc.strokeWidth = Math.max(0.1, st.stroke.width * scale);
    try { doc.strokeOverFill = st.stroke.over !== false ? false : true; } catch (e2) {}
  } else if (st.stroke === null || (st.stroke && !st.stroke.width)) {
    doc.applyStroke = false;
  }
  if (st.noFill) doc.applyFill = false;
  if (st.tracking != null) doc.tracking = st.tracking;
  if (st.justify) {
    var J = { left: ParagraphJustification.LEFT_JUSTIFY, center: ParagraphJustification.CENTER_JUSTIFY, right: ParagraphJustification.RIGHT_JUSTIFY };
    if (J[st.justify]) doc.justification = J[st.justify];
  }
  if (st.leading) { try { doc.autoLeading = false; doc.leading = st.leading * (st.size ? st.size * scale : doc.fontSize); } catch (e3) {} }
  if (st.caps != null) { try { doc.allCaps = st.caps === true; } catch (e4) { if (st.caps) { try { doc.text = String(doc.text).toUpperCase(); } catch (e5) {} } } }
  if (st.text != null) doc.text = st.text;
  srcProp.setValue(doc);
  // After Effects silently substitutes missing fonts; report it.
  try {
    var check = srcProp.value;
    if (requested && check.font !== requested) warnings.push('FONT_MISSING:' + requested);
  } catch (e6) {}
};

/* ------------------------------------------------------------------ */
/* Removing a previous CyriqCap preset                                  */
/* ------------------------------------------------------------------ */
CQ.clearPreset = function (layer, comp) {
  var removed = 0, i;
  try {
    var anims = layer.property('ADBE Text Properties').property('ADBE Text Animators');
    for (i = anims.numProperties; i >= 1; i--) if (anims.property(i).name.indexOf(CQ.TAG) === 0) { anims.property(i).remove(); removed++; }
  } catch (e) {}
  try {
    var fx = layer.property('ADBE Effect Parade');
    for (i = fx.numProperties; i >= 1; i--) if (fx.property(i).name.indexOf(CQ.TAG) === 0) { fx.property(i).remove(); removed++; }
  } catch (e2) {}
  try {
    var masks = layer.property('ADBE Mask Parade');
    for (i = masks.numProperties; i >= 1; i--) if (masks.property(i).name.indexOf(CQ.TAG) === 0) { masks.property(i).remove(); removed++; }
  } catch (e3) {}
  try {
    var tr = layer.property('ADBE Transform Group');
    var names = ['ADBE Scale', 'ADBE Rotate Z', 'ADBE Position', 'ADBE Opacity'];
    for (i = 0; i < names.length; i++) {
      var p = tr.property(names[i]);
      if (p && p.expression && p.expression.indexOf('/*CQ*/') === 0) p.expression = '';
    }
  } catch (e4) {}
  // helper layers that belong to this layer
  try {
    var key = 'CyriqCapExtraOf:' + layer.id;
    for (i = comp.numLayers; i >= 1; i--) {
      var l = comp.layer(i);
      if (l !== layer && String(l.comment).indexOf(key) >= 0) { l.locked = false; l.remove(); removed++; }
    }
  } catch (e5) {}
  return removed;
};

/* ------------------------------------------------------------------ */
/* Animators                                                            */
/* ------------------------------------------------------------------ */
CQ.BASED = { chars: 1, charsNoSpace: 2, words: 3, lines: 4 };

CQ.addAnimator = function (layer, a, idx, scale, warnings) {
  var animators = layer.property('ADBE Text Properties').property('ADBE Text Animators');
  var an = animators.addProperty('ADBE Text Animator');
  an.name = CQ.TAG + (a.label || ('Animator ' + idx));
  var sel = an.property('ADBE Text Selectors').addProperty('ADBE Text Expressible Selector');
  sel.name = CQ.TAG + 'Selector';
  try { sel.property('ADBE Text Range Type2').setValue(CQ.BASED[a.based] || 1); } catch (e) { warnings.push('based on: ' + e.message); }
  CQ.setExpr(sel.property('ADBE Text Expressible Amount'), a.expr, warnings, an.name + ' amount');

  var props = an.property('ADBE Text Animator Properties');
  var p = a.props, v;
  function addP(match, value, label) {
    try { var pr = props.addProperty(match); pr.setValue(value); return pr; } catch (e) { warnings.push((label || match) + ': ' + e.message); return null; }
  }
  if (p.position) addP('ADBE Text Position 3D', [p.position[0] * scale, p.position[1] * scale, 0], 'position');
  if (p.scale) addP('ADBE Text Scale 3D', [p.scale[0], p.scale[1], 100], 'scale');
  if (p.skew != null) addP('ADBE Text Skew', p.skew, 'skew');
  if (p.rotation != null) addP('ADBE Text Rotation', p.rotation, 'rotation');
  if (p.opacity != null) addP('ADBE Text Opacity', p.opacity, 'opacity');
  if (p.fillOpacity != null) addP('ADBE Text Fill Opacity', p.fillOpacity, 'fill opacity');
  if (p.fill) addP('ADBE Text Fill Color', CQ.hexToRgb(p.fill), 'fill color');
  if (p.stroke) addP('ADBE Text Stroke Color', CQ.hexToRgb(p.stroke), 'stroke color');
  if (p.tracking != null) {
    try { var tt = props.addProperty('ADBE Text Track Type'); } catch (e2) {}
    addP('ADBE Text Tracking Amount', p.tracking, 'tracking');
  }
  if (p.charOffset != null) addP('ADBE Text Character Offset', p.charOffset, 'character offset');
  if (p.charValue != null) {
    addP('ADBE Text Character Replace', p.charValue, 'character value');
    try { props.property('ADBE Text Character Change Type').setValue(2); } catch (e3) { warnings.push('character alignment: ' + e3.message); }
  }
  if (p.blur) addP('ADBE Text Blur', [p.blur[0] * scale, p.blur[1] * scale], 'blur');
  return an;
};

/* ------------------------------------------------------------------ */
/* Effects                                                              */
/* ------------------------------------------------------------------ */
CQ.addEffect = function (layer, match, label, warnings) {
  try {
    var fx = layer.property('ADBE Effect Parade').addProperty(match);
    fx.name = CQ.TAG + label;
    return fx;
  } catch (e) {
    warnings.push(label + ': ' + e.message);
    return null;
  }
};

CQ.applyEffect = function (layer, f, scale, warnings, ctx) {
  var fx, p, i;
  switch (f.fx) {
    case 'glow':
      fx = CQ.addEffect(layer, 'ADBE Glo2', 'Glow', warnings); if (!fx) return;
      CQ.safeSet(CQ.fxParam(fx, 2, 'Glow Threshold'), f.threshold != null ? f.threshold * 2.55 : 102, warnings, 'glow threshold');
      CQ.safeSet(CQ.fxParam(fx, 3, 'Glow Radius'), (f.radius || 20) * scale, warnings, 'glow radius');
      CQ.safeSet(CQ.fxParam(fx, 4, 'Glow Intensity'), f.intensity == null ? 1 : f.intensity, warnings, 'glow intensity');
      if (f.color && f.color !== 'auto' && !f.colorsFrom) {
        CQ.safeSet(CQ.fxParam(fx, 7, 'Glow Colors'), 2, warnings, 'glow colors');
        CQ.safeSet(CQ.fxParam(fx, 12, 'Color A'), CQ.hexToRgb(f.color), warnings, 'glow color A');
        CQ.safeSet(CQ.fxParam(fx, 13, 'Color B'), CQ.hexToRgb(f.color), warnings, 'glow color B');
        if (f.exprA) CQ.setExpr(CQ.fxParam(fx, 12, 'Color A'), f.exprA, warnings, 'glow flash');
        if (f.exprA) CQ.setExpr(CQ.fxParam(fx, 13, 'Color B'), f.exprA, warnings, 'glow flash');
      }
      break;
    case 'ramp':
      fx = CQ.addEffect(layer, 'ADBE Ramp', 'Gradient', warnings); if (!fx) return;
      var rs = '/*CQ*/var r=thisLayer.sourceRectAtTime(time,false);';
      if (f.dir === 'horizontal') {
        CQ.setExpr(CQ.fxParam(fx, 1, 'Start of Ramp'), rs + '[r.left,r.top+r.height/2];', warnings, 'ramp start');
        CQ.setExpr(CQ.fxParam(fx, 3, 'End of Ramp'), rs + '[r.left+r.width,r.top+r.height/2];', warnings, 'ramp end');
      } else {
        CQ.setExpr(CQ.fxParam(fx, 1, 'Start of Ramp'), rs + '[r.left+r.width/2,r.top];', warnings, 'ramp start');
        CQ.setExpr(CQ.fxParam(fx, 3, 'End of Ramp'), rs + '[r.left+r.width/2,r.top+r.height];', warnings, 'ramp end');
      }
      CQ.safeSet(CQ.fxParam(fx, 2, 'Start Color'), CQ.hexToRgb(f.c1), warnings, 'ramp color 1');
      CQ.safeSet(CQ.fxParam(fx, 4, 'End Color'), CQ.hexToRgb(f.c2), warnings, 'ramp color 2');
      break;
    case 'texture':
      fx = CQ.addEffect(layer, 'ADBE Fractal Noise', 'Texture', warnings); if (!fx) return;
      p = CQ.findParamByName(fx, 'Contrast'); if (p) CQ.safeSet(p, 180, warnings, 'texture contrast');
      p = CQ.findParamByName(fx, 'Scale'); if (p) CQ.safeSet(p, (f.scale || 20) * 4 * scale, warnings, 'texture scale');
      p = CQ.findParamByName(fx, 'Evolution'); if (p) CQ.setExpr(p, 'time*' + (f.speed || 1) * 180 + ';', warnings, 'texture evolution');
      p = CQ.findParamByName(fx, 'Opacity'); if (p) CQ.safeSet(p, Math.round((f.amount || 0.4) * 100), warnings, 'texture opacity');
      p = CQ.findParamByName(fx, 'Blending Mode'); if (p) CQ.safeSet(p, f.blend || 21, warnings, 'texture blending');
      break;
    case 'bevel':
      fx = CQ.addEffect(layer, 'ADBE Bevel Alpha', 'Bevel', warnings); if (!fx) return;
      CQ.safeSet(CQ.fxParam(fx, 1, 'Edge Thickness'), (f.thickness || 3) * scale, warnings, 'bevel thickness');
      CQ.safeSet(CQ.fxParam(fx, 2, 'Light Angle'), f.angle == null ? -45 : f.angle, warnings, 'bevel angle');
      CQ.safeSet(CQ.fxParam(fx, 4, 'Light Intensity'), f.intensity == null ? 0.6 : f.intensity, warnings, 'bevel intensity');
      break;
    case 'shadow':
      fx = CQ.addEffect(layer, 'ADBE Drop Shadow', 'Shadow', warnings); if (!fx) return;
      CQ.safeSet(CQ.fxParam(fx, 1, 'Shadow Color'), CQ.hexToRgb(f.color || '#000000'), warnings, 'shadow color');
      CQ.safeSet(CQ.fxParam(fx, 2, 'Opacity'), (f.opacity == null ? 75 : f.opacity) * 2.55, warnings, 'shadow opacity');
      CQ.safeSet(CQ.fxParam(fx, 3, 'Direction'), f.direction == null ? 135 : f.direction, warnings, 'shadow direction');
      CQ.safeSet(CQ.fxParam(fx, 4, 'Distance'), (f.distance || 0) * scale, warnings, 'shadow distance');
      CQ.safeSet(CQ.fxParam(fx, 5, 'Softness'), (f.softness || 0) * scale, warnings, 'shadow softness');
      break;
    case 'rgbSplit':
      var sides = [['#ff1a3c', 270], ['#1a6bff', 90]];
      for (i = 0; i < 2; i++) {
        fx = CQ.addEffect(layer, 'ADBE Drop Shadow', (i ? 'Split Blue' : 'Split Red'), warnings); if (!fx) return;
        CQ.safeSet(CQ.fxParam(fx, 1, 'Shadow Color'), CQ.hexToRgb(sides[i][0]), warnings, 'split color');
        CQ.safeSet(CQ.fxParam(fx, 2, 'Opacity'), 230, warnings, 'split opacity');
        CQ.safeSet(CQ.fxParam(fx, 3, 'Direction'), sides[i][1], warnings, 'split direction');
        CQ.safeSet(CQ.fxParam(fx, 4, 'Distance'), (f.amount || 6) * scale, warnings, 'split distance');
        CQ.safeSet(CQ.fxParam(fx, 5, 'Softness'), 0, warnings, 'split softness');
        if (f.distExpr) CQ.setExpr(CQ.fxParam(fx, 4, 'Distance'), f.distExpr, warnings, 'split distance');
      }
      break;
    case 'mosaic':
      fx = CQ.addEffect(layer, 'ADBE Mosaic', 'Pixelate', warnings); if (!fx) return;
      CQ.setExpr(CQ.fxParam(fx, 1, 'Horizontal Blocks'), f.expr, warnings, 'mosaic');
      CQ.setExpr(CQ.fxParam(fx, 2, 'Vertical Blocks'), f.expr, warnings, 'mosaic');
      break;
    case 'sliceJitter':
      fx = CQ.addEffect(layer, 'ADBE Wave Warp', 'Slice Jitter', warnings); if (!fx) return;
      CQ.safeSet(CQ.fxParam(fx, 1, 'Wave Type'), 8, warnings, 'slice type');
      CQ.setExpr(CQ.fxParam(fx, 2, 'Wave Height'), f.expr, warnings, 'slice height');
      CQ.safeSet(CQ.fxParam(fx, 3, 'Wave Width'), 60 * scale, warnings, 'slice width');
      CQ.safeSet(CQ.fxParam(fx, 4, 'Direction'), 0, warnings, 'slice direction');
      CQ.safeSet(CQ.fxParam(fx, 5, 'Wave Speed'), 6, warnings, 'slice speed');
      CQ.safeSet(CQ.fxParam(fx, 6, 'Pinning'), 1, warnings, 'slice pinning');
      break;
    case 'wave':
      fx = CQ.addEffect(layer, 'ADBE Wave Warp', 'Wave', warnings); if (!fx) return;
      CQ.safeSet(CQ.fxParam(fx, 1, 'Wave Type'), 1, warnings, 'wave type');
      CQ.setExpr(CQ.fxParam(fx, 2, 'Wave Height'), f.expr, warnings, 'wave height');
      CQ.safeSet(CQ.fxParam(fx, 3, 'Wave Width'), (f.width || 140) * scale, warnings, 'wave width');
      CQ.safeSet(CQ.fxParam(fx, 4, 'Direction'), 90, warnings, 'wave direction');
      CQ.safeSet(CQ.fxParam(fx, 5, 'Wave Speed'), f.speed || 2, warnings, 'wave speed');
      break;
    case 'burn':
      fx = CQ.addEffect(layer, 'CC Burn Film', 'Burn', warnings); if (!fx) return;
      CQ.setExpr(CQ.fxParam(fx, 1, 'Burn'), f.expr, warnings, 'burn');
      CQ.setExpr(CQ.fxParam(fx, 2, 'Center'), '/*CQ*/var r=thisLayer.sourceRectAtTime(time,false);[r.left+r.width/2,r.top+r.height/2];', warnings, 'burn center');
      break;
    case 'shatter':
      fx = CQ.addEffect(layer, 'ADBE Shatter', 'Shatter', warnings); if (!fx) return;
      p = CQ.findParamByName(fx, 'View'); if (p) CQ.safeSet(p, 1, warnings, 'shatter view');
      p = CQ.findParamByName(fx, 'Pattern'); if (p) CQ.safeSet(p, 3, warnings, 'shatter pattern');
      p = CQ.findParamByName(fx, 'Repetitions'); if (p) CQ.safeSet(p, 18, warnings, 'shatter repetitions');
      p = CQ.findParamByName(fx, 'Extrusion Depth'); if (p) CQ.safeSet(p, 0.1, warnings, 'shatter depth');
      p = CQ.findParamByName(fx, 'Radius'); if (p) CQ.setExpr(p, f.radiusExpr, warnings, 'shatter radius');
      p = CQ.findParamByName(fx, 'Strength'); if (p) CQ.safeSet(p, 6, warnings, 'shatter strength');
      p = CQ.findParamByName(fx, 'Gravity'); if (p) CQ.safeSet(p, 3, warnings, 'shatter gravity');
      break;
    case 'linearWipe':
      fx = CQ.addEffect(layer, 'ADBE Linear Wipe', 'Write On', warnings); if (!fx) return;
      CQ.setExpr(CQ.fxParam(fx, 1, 'Transition Completion'), f.expr, warnings, 'wipe');
      CQ.safeSet(CQ.fxParam(fx, 2, 'Wipe Angle'), 270, warnings, 'wipe angle');
      CQ.safeSet(CQ.fxParam(fx, 3, 'Feather'), (f.feather || 40) * scale, warnings, 'wipe feather');
      break;
    case 'plugin':
      var spec = ctx.plugins[f.plugin];
      var needles = f.effect ? [f.effect] : (spec ? spec.match : []);
      var found = CQ.findEffect(needles);
      if (!found) { warnings.push('PLUGIN_MISSING:' + f.plugin); return; }
      fx = CQ.addEffect(layer, found.m, found.d, warnings); if (!fx) return;
      if (f.params) {
        for (var k in f.params) if (f.params.hasOwnProperty(k)) {
          p = CQ.findParamByName(fx, k);
          if (p) CQ.safeSet(p, f.params[k], warnings, found.d + ' ' + k);
        }
      }
      break;
  }
};

/* ------------------------------------------------------------------ */
/* Helper shape / text layers                                           */
/* ------------------------------------------------------------------ */
CQ.newShape = function (comp, owner, label) {
  var s = comp.layers.addShape();
  s.name = CQ.TAG + label + ' - ' + owner.name;
  s.comment = 'CyriqCapExtraOf:' + owner.id;
  s.parent = owner;
  s.property('ADBE Transform Group').property('ADBE Anchor Point').setValue([0, 0]);
  s.property('ADBE Transform Group').property('ADBE Position').setValue([0, 0]);
  s.inPoint = owner.inPoint; s.outPoint = owner.outPoint;
  return s;
};

CQ.shapeGroup = function (shapeLayer, name) {
  var g = shapeLayer.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
  g.name = name;
  return g.property('ADBE Vectors Group');
};

CQ.addRect = function (vectors, sizeExpr, posExpr, warnings) {
  var r = vectors.addProperty('ADBE Vector Shape - Rect');
  CQ.setExpr(r.property('ADBE Vector Rect Size'), sizeExpr, warnings, 'rect size');
  CQ.setExpr(r.property('ADBE Vector Rect Position'), posExpr, warnings, 'rect position');
  return r;
};

CQ.addPathExpr = function (vectors, expr, warnings) {
  var sh = vectors.addProperty('ADBE Vector Shape - Group');
  CQ.setExpr(sh.property('ADBE Vector Shape'), expr, warnings, 'path');
  return sh;
};

CQ.addFill = function (vectors, color) {
  var f = vectors.addProperty('ADBE Vector Graphic - Fill');
  f.property('ADBE Vector Fill Color').setValue(CQ.hexToRgb(color));
  return f;
};

CQ.addStroke = function (vectors, color, width, dashed) {
  var s = vectors.addProperty('ADBE Vector Graphic - Stroke');
  s.property('ADBE Vector Stroke Color').setValue(CQ.hexToRgb(color));
  s.property('ADBE Vector Stroke Width').setValue(width);
  try { s.property('ADBE Vector Stroke Line Cap').setValue(2); } catch (e) {}
  if (dashed) {
    try {
      var d = s.property('ADBE Vector Stroke Dashes');
      d.addProperty('ADBE Vector Stroke Dash 1').setValue(dashed);
      d.addProperty('ADBE Vector Stroke Gap 1').setValue(dashed);
    } catch (e2) {}
  }
  return s;
};

CQ.addTrim = function (vectors, endExpr, warnings) {
  var t = vectors.addProperty('ADBE Vector Filter - Trim');
  CQ.setExpr(t.property('ADBE Vector Trim End'), endExpr, warnings, 'trim end');
  return t;
};

CQ.duplicateText = function (comp, owner, label, text) {
  var d = owner.duplicate();
  d.name = CQ.TAG + label + ' - ' + owner.name;
  d.comment = 'CyriqCapExtraOf:' + owner.id;
  // remove our animators/effects on the copy, keep the base style
  var i;
  try { var fx = d.property('ADBE Effect Parade'); for (i = fx.numProperties; i >= 1; i--) fx.property(i).remove(); } catch (e) {}
  try { var an = d.property('ADBE Text Properties').property('ADBE Text Animators'); for (i = an.numProperties; i >= 1; i--) an.property(i).remove(); } catch (e2) {}
  if (text != null) {
    var sp = d.property('ADBE Text Properties').property('ADBE Text Document');
    var doc = sp.value; doc.text = text; sp.setValue(doc);
  }
  d.parent = owner;
  return d;
};

/** e = extra spec from the panel (expressions are prepared by the panel). */
CQ.buildExtra = function (comp, layer, e, scale, warnings) {
  var s, v, i;
  var R = '/*CQ*/var L=thisLayer.parent;var r=L.sourceRectAtTime(time,false);';
  switch (e.type) {
    case 'box':
    case 'outlineBox':
    case 'sweepBlock':
      s = CQ.newShape(comp, layer, e.type);
      v = CQ.shapeGroup(s, e.type);
      CQ.addRect(v, R + e.sizeExpr, R + e.posExpr, warnings);
      if (e.type === 'outlineBox') CQ.addStroke(v, e.color, (e.width || 4) * scale); else CQ.addFill(v, e.color);
      if (e.opacityExpr) CQ.setExpr(s.property('ADBE Transform Group').property('ADBE Opacity'), e.opacityExpr, warnings, e.type + ' opacity');
      if (e.type === 'box') s.moveAfter(layer); else s.moveBefore(layer);
      break;
    case 'spinLine':
    case 'line':
    case 'dashline':
    case 'swoosh':
    case 'drip':
    case 'chevrons':
    case 'brackets':
    case 'laserLines':
      s = CQ.newShape(comp, layer, e.type);
      for (i = 0; i < e.paths.length; i++) {
        v = CQ.shapeGroup(s, e.type + ' ' + (i + 1));
        CQ.addPathExpr(v, R + e.paths[i], warnings);
        if (e.fill) CQ.addFill(v, e.color); else CQ.addStroke(v, e.color, (e.width || 3) * scale, e.type === 'dashline' ? 6 * scale : 0);
        if (e.trimExpr) CQ.addTrim(v, e.trimExpr, warnings);
      }
      if (e.opacityExpr) CQ.setExpr(s.property('ADBE Transform Group').property('ADBE Opacity'), e.opacityExpr, warnings, e.type + ' opacity');
      if (e.rotationExpr) CQ.setExpr(s.property('ADBE Transform Group').property('ADBE Rotate Z'), e.rotationExpr, warnings, e.type + ' rotation');
      if (e.anchorExpr) {
        CQ.setExpr(s.property('ADBE Transform Group').property('ADBE Anchor Point'), e.anchorExpr, warnings, e.type + ' anchor');
        CQ.setExpr(s.property('ADBE Transform Group').property('ADBE Position'), e.anchorExpr, warnings, e.type + ' position');
      }
      if (e.glow) {
        var g = s.property('ADBE Effect Parade').addProperty('ADBE Glo2');
        CQ.safeSet(CQ.fxParam(g, 3, 'Glow Radius'), 20 * scale, warnings, 'line glow');
      }
      s.moveBefore(layer);
      break;
    case 'dashes':
      var dash = CQ.duplicateText(comp, layer, 'Dashes', null);
      // every glyph drawn as a dash, keeping the original letter spacing
      CQ.addAnimator(dash, { based: 'chars', props: { charValue: 45 }, expr: '[100,100,100];', label: 'Dash glyph' }, 1, scale, warnings);
      CQ.addAnimator(dash, { based: 'chars', props: { opacity: 0 }, expr: e.expr, label: 'Dash' }, 2, scale, warnings);
      dash.moveAfter(layer);
      break;
    case 'echoRows':
      var base = String(layer.property('ADBE Text Properties').property('ADBE Text Document').value.text).replace(/[\r\n]+/g, ' ');
      var rep = [];
      for (i = 0; i < 7; i++) rep.push(base);
      for (i = 0; i < e.rows.length; i++) {
        var row = CQ.duplicateText(comp, layer, 'Echo ' + (i + 1), rep.join('   '));
        var sp = row.property('ADBE Text Properties').property('ADBE Text Document');
        var doc = sp.value;
        doc.applyFill = false; doc.applyStroke = true; doc.strokeColor = CQ.hexToRgb(e.color); doc.strokeWidth = Math.max(1, (e.width || 2) * scale);
        sp.setValue(doc);
        CQ.setExpr(row.property('ADBE Transform Group').property('ADBE Position'), e.rows[i], warnings, 'echo row');
        CQ.setExpr(row.property('ADBE Transform Group').property('ADBE Opacity'), e.opacityExpr, warnings, 'echo opacity');
        row.moveAfter(layer);
      }
      break;
  }
};

/* ------------------------------------------------------------------ */
/* Timing keyframes                                                     */
/* ------------------------------------------------------------------ */
/**
 * Two slider controls drive every CyriqCap animation on a layer:
 *   "CQ In"  : 0 -> 100 from the layer's in-point
 *   "CQ Out" : 0 -> 100 ending at the layer's out-point
 * The keyframes always sit at the start and end of that layer, so each
 * selected layer animates on its own timing. Move them to retime.
 */
CQ.addTimingSliders = function (layer, timing, warnings) {
  var inT = timing && timing.inT ? timing.inT : 0.5, outT = timing && timing.outT ? timing.outT : 0.5;
  var a = layer.inPoint, b = layer.outPoint, len = Math.max(0.001, b - a);
  // short layers (fast captions): squeeze both animations to fit
  var k = Math.min(1, (len * 0.98) / (inT + outT));
  var fps = 1 / layer.containingComp.frameDuration;
  function snap(t) { return Math.round(t * fps) / fps; }
  var defs = [['In', a, snap(a + inT * k)], ['Out', snap(b - outT * k), b]];
  for (var i = 0; i < defs.length; i++) {
    var fx = CQ.addEffect(layer, 'ADBE Slider Control', defs[i][0], warnings);
    if (!fx) continue;
    var sl = CQ.fxParam(fx, 1, 'Slider');
    try {
      var t0 = defs[i][1], t1 = Math.max(defs[i][1] + 0.001, defs[i][2]);
      sl.setValueAtTime(t0, 0);
      sl.setValueAtTime(t1, 100);
      for (var kk = 1; kk <= sl.numKeys; kk++) sl.setInterpolationTypeAtKey(kk, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
    } catch (e) { warnings.push('timing keys: ' + e.message); }
  }
};

/* ------------------------------------------------------------------ */
/* Apply a preset                                                       */
/* ------------------------------------------------------------------ */
CQ.applyToLayer = function (comp, layer, P, opts, warnings) {
  var scale = comp.height / 1080;
  var i;
  CQ.clearPreset(layer, comp);
  if (P.style) CQ.styleText(layer, P.style, scale, warnings);
  CQ.addTimingSliders(layer, P.timing, warnings);

  // character anchor at the vertical centre (rotations/scales look right)
  try { layer.property('ADBE Text Properties').property('ADBE Text More Options').property('ADBE Text Anchor Point Align').setValue([0, -50]); } catch (e) { warnings.push('grouping alignment: ' + e.message); }

  for (i = 0; i < P.anims.length; i++) CQ.addAnimator(layer, P.anims[i], i + 1, scale, warnings);

  var ctx = { plugins: P.plugins || {} };
  for (i = 0; i < (P.fx || []).length; i++) CQ.applyEffect(layer, P.fx[i], scale, warnings, ctx);

  var tr = layer.property('ADBE Transform Group');
  if (P.layer) {
    if (P.layer.scaleExpr) CQ.setExpr(tr.property('ADBE Scale'), P.layer.scaleExpr, warnings, 'layer scale');
    if (P.layer.rotationExpr) CQ.setExpr(tr.property('ADBE Rotate Z'), P.layer.rotationExpr, warnings, 'layer rotation');
    if (P.layer.positionExpr) CQ.setExpr(tr.property('ADBE Position'), P.layer.positionExpr, warnings, 'layer position');
  }

  if (P.mask) {
    try {
      var r = layer.sourceRectAtTime((layer.inPoint + layer.outPoint) / 2, false);
      var m = layer.property('ADBE Mask Parade').addProperty('ADBE Mask Atom');
      m.name = CQ.TAG + 'Clip';
      var sh = new Shape();
      var bottom = r.top + r.height + (P.mask.pad || 0) * scale;
      var top = r.top - 2000 * scale, left = r.left - 2000 * scale, right = r.left + r.width + 2000 * scale;
      sh.vertices = [[left, top], [right, top], [right, bottom], [left, bottom]];
      sh.closed = true;
      m.property('ADBE Mask Shape').setValue(sh);
    } catch (e2) { warnings.push('clip mask: ' + e2.message); }
  }

  if (P.slices) {
    try {
      var mid = layer.sourceRectAtTime((layer.inPoint + layer.outPoint) / 2, false);
      var cy = mid.top + mid.height / 2;
      var half = function (l, top) {
        var mk = l.property('ADBE Mask Parade').addProperty('ADBE Mask Atom');
        mk.name = CQ.TAG + 'Slice';
        var s2 = new Shape();
        var y0 = top ? cy - 4000 : cy, y1 = top ? cy : cy + 4000;
        s2.vertices = [[-8000, y0], [8000, y0], [8000, y1], [-8000, y1]]; s2.closed = true;
        mk.property('ADBE Mask Shape').setValue(s2);
      };
      var bottomCopy = CQ.duplicateText(comp, layer, 'Slice', null);
      // the copy keeps the same animators and timing keys as the original
      CQ.addTimingSliders(bottomCopy, P.timing, warnings);
      for (i = 0; i < P.anims.length; i++) CQ.addAnimator(bottomCopy, P.anims[i], i + 1, scale, warnings);
      half(layer, true); half(bottomCopy, false);
      CQ.setExpr(tr.property('ADBE Position'), P.slices.exprA, warnings, 'slice A');
      CQ.setExpr(bottomCopy.property('ADBE Transform Group').property('ADBE Position'), P.slices.exprB, warnings, 'slice B');
      bottomCopy.moveAfter(layer);
    } catch (e3) { warnings.push('slices: ' + e3.message); }
  }

  for (i = 0; i < (P.extras || []).length; i++) {
    try { CQ.buildExtra(comp, layer, P.extras[i], scale, warnings); } catch (e4) { warnings.push('extra ' + P.extras[i].type + ': ' + e4.message); }
  }

  layer.comment = 'CyriqCap:' + P.id + ' v' + CQ.VERSION;
  try { if (P.motionBlur) { layer.motionBlur = true; comp.motionBlur = true; } } catch (e5) {}
};

/** payload: {preset: <built preset>, targets: 'selected' | [layer indices]} */
CQ.applyPreset = function (json) {
  var comp = CQ.activeComp();
  if (!comp) return CQ.fail('NO_COMP', 'Open a composition first.');
  var P;
  try { P = CQJSON.parse(json); } catch (e) { return CQ.fail('BAD_REQUEST', e.message); }
  var preset = P.preset;
  var sel = comp.selectedLayers, targets = [], skipped = [], i;
  for (i = 0; i < sel.length; i++) {
    if (sel[i] instanceof TextLayer) {
      if (sel[i].locked) skipped.push({ name: sel[i].name, reason: 'locked' });
      else targets.push(sel[i]);
    } else skipped.push({ name: sel[i].name, reason: 'not a text layer' });
  }
  if (!targets.length) return CQ.fail('NO_TEXT_LAYERS', 'Select one or more text layers in the timeline.', { skipped: skipped });

  // plug-in requirements are checked before anything changes
  var missing = [];
  for (i = 0; i < (preset.needs || []).length; i++) {
    var key = preset.needs[i];
    var spec = (preset.plugins || {})[key];
    if (!spec || !CQ.findEffect(spec.match)) missing.push(key);
  }
  if (missing.length) return CQ.fail('PLUGIN_MISSING', 'Missing plug-in', { missing: missing });

  var results = [];
  app.beginUndoGroup('CyriqCap: ' + preset.name);
  try {
    for (i = 0; i < targets.length; i++) {
      var w = [];
      try { CQ.applyToLayer(comp, targets[i], preset, P, w); results.push({ name: targets[i].name, ok: true, warnings: w }); }
      catch (e2) { results.push({ name: targets[i].name, ok: false, error: e2.message, warnings: w }); }
    }
  } finally {
    app.endUndoGroup();
  }
  return CQ.ok({ results: results, skipped: skipped });
};

/** Remove CyriqCap presets from selected text layers. */
CQ.removePreset = function () {
  var comp = CQ.activeComp();
  if (!comp) return CQ.fail('NO_COMP', 'Open a composition first.');
  var sel = comp.selectedLayers, n = 0, i;
  app.beginUndoGroup('CyriqCap: Remove preset');
  try {
    for (i = 0; i < sel.length; i++) if (sel[i] instanceof TextLayer) { CQ.clearPreset(sel[i], comp); sel[i].comment = ''; n++; }
  } finally { app.endUndoGroup(); }
  return CQ.ok({ cleared: n });
};

/* ------------------------------------------------------------------ */
/* Audio sources (for transcription)                                    */
/* ------------------------------------------------------------------ */
/**
 * Collect the audio that makes up a layer, in that layer's source time.
 * For footage: one file. For precomps: every audible footage layer inside,
 * recursively, with its offset/in/out mapped into the precomp's time.
 */
CQ.collectAudio = function (layer, offset, depth, out, warnings, clipStart, clipEnd) {
  if (depth > 8) { warnings.push('Nested too deep'); return; }
  var src = layer.source;
  if (src instanceof CompItem) {
    for (var i = 1; i <= src.numLayers; i++) {
      var l = src.layer(i);
      try {
        if (!(l instanceof AVLayer)) continue;
        if (!l.source || !l.source.hasAudio) continue;
        if (!l.audioEnabled) continue;
        if (l.timeRemapEnabled) warnings.push('Time remap ignored on "' + l.name + '"');
        var inT = Math.max(l.inPoint, clipStart != null ? clipStart - offset : -1e9);
        var outT = Math.min(l.outPoint, clipEnd != null ? clipEnd - offset : 1e9);
        if (outT <= inT) continue;
        if (l.source instanceof CompItem) CQ.collectAudio(l, offset + l.startTime, depth + 1, out, warnings, offset + inT, offset + outT);
        else if (l.source.file) {
          out.push({ file: l.source.file.fsName, exists: l.source.file.exists, at: offset + inT, from: (inT - l.startTime) * 100 / l.stretch, to: (outT - l.startTime) * 100 / l.stretch, stretch: l.stretch, name: l.name });
        }
      } catch (e) { warnings.push(l.name + ': ' + e.message); }
    }
  }
};

/** Describe what to extract for the selected source layer. Times are comp times. */
CQ.getAudioPlan = function (json) {
  try {
    var comp = CQ.activeComp();
    if (!comp) return CQ.fail('NO_COMP', 'Open a composition first.');
    var req = CQJSON.parse(json || '{}');
    var sel = comp.selectedLayers;
    if (!sel.length) return CQ.fail('NO_SELECTION', 'Select an audio, video or precomp layer in the timeline.');
    var cand = [], i;
    for (i = 0; i < sel.length; i++) {
      var k = CQ.layerKind(sel[i]);
      if (k === 'audio' || k === 'video-audio' || k === 'precomp') cand.push(sel[i]);
    }
    if (!cand.length) return CQ.fail('UNSUPPORTED_LAYER', 'The selected layer has no audio.', { kinds: CQ.layerKind(sel[0]) });
    if (cand.length > 1) return CQ.fail('MULTIPLE_SOURCES', 'Select only one source layer.', { count: cand.length });
    var l = cand[0], warnings = [];
    if (l.timeRemapEnabled) warnings.push('Time remap is enabled on this layer; caption timing assumes no remap.');
    var plan = { layer: CQ.describeLayer(l, comp), comp: { width: comp.width, height: comp.height, frameRate: comp.frameRate, duration: comp.duration }, pieces: [], warnings: warnings };
    if (CQ.layerKind(l) === 'precomp') {
      var pieces = [];
      CQ.collectAudio(l, l.startTime, 0, pieces, warnings, l.inPoint, l.outPoint);
      if (!pieces.length) return CQ.fail('NO_AUDIO', 'No audible layers inside this precomp.');
      plan.pieces = pieces;
      plan.mode = 'mix';
    } else {
      if (!l.source.file) return CQ.fail('NO_FILE', 'This layer has no media file.');
      if (!l.source.file.exists) return CQ.fail('FILE_MISSING', 'Media file is missing: ' + l.source.file.fsName);
      plan.mode = 'file';
      plan.pieces = [{ file: l.source.file.fsName, exists: true, at: l.inPoint, from: (l.inPoint - l.startTime) * 100 / l.stretch, to: (l.outPoint - l.startTime) * 100 / l.stretch, stretch: l.stretch, name: l.name }];
    }
    plan.range = { start: l.inPoint, end: l.outPoint };
    return CQ.ok(plan);
  } catch (e) { return CQ.fail('AUDIO_PLAN', e.message); }
};

/* ------------------------------------------------------------------ */
/* Create caption layers                                                */
/* ------------------------------------------------------------------ */
/**
 * payload = {
 *   captions: [{text, start, end, highlightExpr?}],   (comp times, seconds)
 *   style: {font, size, fill, stroke, tracking, caps, justify, leading},
 *   position: [x, y] (comp px), box: {color, opacity, padX, padY, round} | null,
 *   shadow: {...} | null, preset: <built preset> | null, prefix: 'Caption'
 * }
 */
CQ.createCaptions = function (json) {
  var comp = CQ.activeComp();
  if (!comp) return CQ.fail('NO_COMP', 'Open a composition first.');
  var P;
  try { P = CQJSON.parse(json); } catch (e) { return CQ.fail('BAD_REQUEST', e.message); }
  var caps = P.captions || [];
  if (!caps.length) return CQ.fail('EMPTY', 'Nothing to create.');
  var frame = 1 / comp.frameRate, i;
  // validate everything before touching the project
  for (i = 0; i < caps.length; i++) {
    var c = caps[i];
    if (typeof c.text !== 'string' || !c.text.length) return CQ.fail('BAD_CAPTION', 'Caption ' + (i + 1) + ' has no text.');
    if (!(c.end > c.start)) return CQ.fail('BAD_CAPTION', 'Caption ' + (i + 1) + ' ends before it starts.');
  }
  var created = [], warnings = [], scale = comp.height / 1080;
  var names = {};
  for (i = 1; i <= comp.numLayers; i++) names[comp.layer(i).name] = 1;
  var prefix = P.prefix || 'Caption';
  var anchorLayer = null;
  try { if (P.aboveLayerIndex) anchorLayer = comp.layer(P.aboveLayerIndex); } catch (e0) {}

  app.beginUndoGroup('CyriqCap: Create captions');
  try {
    for (i = 0; i < caps.length; i++) {
      var cap = caps[i];
      var start = Math.max(0, Math.min(comp.duration - frame, cap.start));
      var end = Math.max(start + frame, Math.min(comp.duration, cap.end));
      var layer = comp.layers.addText(cap.text);
      var n = 1, nm;
      do { nm = prefix + ' ' + (i + 1 < 10 ? '00' : (i + 1 < 100 ? '0' : '')) + (i + 1) + (n > 1 ? ' (' + n + ')' : ''); n++; } while (names[nm]);
      names[nm] = 1;
      layer.name = nm;
      var w = [];
      CQ.styleText(layer, P.style, 1, w);
      layer.startTime = 0;
      layer.inPoint = start;
      layer.outPoint = end;
      // position: anchor at the text centre so alignment is stable
      try {
        var av = P.anchor ? P.anchor.v : 'middle', ah = P.anchor ? P.anchor.h : 'center';
        var ax = ah === 'left' ? 'r.left' : ah === 'right' ? 'r.left+r.width' : 'r.left+r.width/2';
        var ay = av === 'top' ? 'r.top' : av === 'bottom' ? 'r.top+r.height' : 'r.top+r.height/2';
        CQ.setExpr(layer.property('ADBE Transform Group').property('ADBE Anchor Point'), '/*CQ*/var r=sourceRectAtTime(inPoint+(outPoint-inPoint)/2,false);[' + ax + ',' + ay + '];', w, 'anchor');
        layer.property('ADBE Transform Group').property('ADBE Position').setValue([P.position[0], P.position[1]]);
      } catch (e1) { w.push('position: ' + e1.message); }
      if (P.highlight && cap.highlightExpr) {
        CQ.addAnimator(layer, { based: 'words', props: { fill: P.highlight.color }, expr: cap.highlightExpr, label: 'Highlight' }, 1, 1, w);
        // keep it when a preset is applied on top
        var hl = layer.property('ADBE Text Properties').property('ADBE Text Animators');
        hl.property(hl.numProperties).name = 'Highlight';
      }
      if (P.shadow) CQ.applyEffect(layer, P.shadow, scale, w, { plugins: {} });
      if (P.preset) {
        try {
          var pr = P.preset;
          var keepStyle = pr.style; pr.style = null; // caption style wins
          CQ.applyToLayer(comp, layer, pr, P, w);
          pr.style = keepStyle;
          layer.comment = 'CyriqCap caption | CyriqCap:' + pr.id;
        } catch (e2) { w.push('preset: ' + e2.message); }
      } else {
        layer.comment = 'CyriqCap caption';
      }
      if (P.box) {
        try {
          var bx = CQ.newShape(comp, layer, 'Box');
          var vv = CQ.shapeGroup(bx, 'box');
          var rr = vv.addProperty('ADBE Vector Shape - Rect');
          var R = '/*CQ*/var L=thisLayer.parent;var r=L.sourceRectAtTime(time,false);';
          CQ.setExpr(rr.property('ADBE Vector Rect Size'), R + '[r.width+' + (P.box.padX * 2) + ',r.height+' + (P.box.padY * 2) + '];', w, 'box size');
          CQ.setExpr(rr.property('ADBE Vector Rect Position'), R + '[r.left+r.width/2,r.top+r.height/2];', w, 'box pos');
          rr.property('ADBE Vector Rect Roundness').setValue(P.box.round || 0);
          var bf = CQ.addFill(vv, P.box.color);
          bf.property('ADBE Vector Fill Opacity').setValue(P.box.opacity == null ? 70 : P.box.opacity);
          bx.moveAfter(layer);
        } catch (e3) { w.push('box: ' + e3.message); }
      }
      if (anchorLayer) { try { layer.moveBefore(anchorLayer); } catch (e4) {} }
      created.push({ name: layer.name, index: layer.index, warnings: w });
      for (var q = 0; q < w.length; q++) if (w[q].indexOf('FONT_MISSING') === 0 && warnings.join('|').indexOf(w[q]) < 0) warnings.push(w[q]);
    }
  } catch (e5) {
    app.endUndoGroup();
    return CQ.fail('CREATE_FAILED', e5.message, { created: created.length, hint: 'Press Ctrl+Z once to undo the partial result.' });
  }
  app.endUndoGroup();
  return CQ.ok({ created: created.length, layers: created, warnings: warnings });
};

/* ------------------------------------------------------------------ */
/* Misc                                                                 */
/* ------------------------------------------------------------------ */
CQ.ping = function () { return CQ.ok({ version: CQ.VERSION, ae: app.version, os: $.os, lang: app.isoLanguage }); };

CQ.revealFile = function (json) {
  try { var p = CQJSON.parse(json); var f = new File(p.path); if (f.exists) f.parent.execute(); return CQ.ok({}); } catch (e) { return CQ.fail('REVEAL', e.message); }
};

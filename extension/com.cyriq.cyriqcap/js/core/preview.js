/*
 * CyriqCap preview renderer.
 *
 * Draws a preset on a <canvas> at any time t. Character timing comes from the
 * exact expression source used in After Effects (CQ.expr.compileAmount), so the
 * motion matches. Effects (glow, gradient, texture, ...) are canvas
 * re-creations of the After Effects effects the preset builds.
 *
 * Virtual composition: 1920 x 1080. Everything is scaled to the canvas.
 */
(function (root) {
  'use strict';
  var CQ = root.CQ = root.CQ || {};


  function hex(c) {
    if (Array.isArray(c)) return c;
    var s = String(c || '#ffffff').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(c, a) { var h = hex(c); return 'rgba(' + h[0] + ',' + h[1] + ',' + h[2] + ',' + (a == null ? 1 : a) + ')'; }
  function mix(a, b, k) { var x = hex(a), y = hex(b); return [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]; }
  function cl(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function rnd(k, seed) { var x = Math.sin((k + 1) * 12.9898 + (seed || 3) * 78.233) * 43758.5453; return x - Math.floor(x); }
  function easeOut(p) { p = cl(p); return 1 - Math.pow(1 - p, 3); }
  function expoOut(p) { p = cl(p); return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p); }

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }

  /** Total running time for the preview loop of a preset. */
  function timeline(p, o) {
    var maxIn = 0, maxOut = 0, loop = false;
    CQ.presets.normalize(p).forEach(function (a) {
      var t = a.t || {};
      if (t.phase === 'loop' || t.phase === 'drift' || t.jitter || t.wiggle) loop = true;
      maxIn = Math.max(maxIn, (t.dur || 0.8) + (t.delay || 0));
      maxOut = Math.max(maxOut, t.outDur || t.dur || 0.8);
    });
    (p.extras || []).forEach(function (e) { maxIn = Math.max(maxIn, (e.delay || 0) + (e.dur || 0.5)); });
    (p.fx || []).forEach(function (f) { if (f.fx === 'burn') { maxIn = Math.max(maxIn, f.dur || 0.9); maxOut = Math.max(maxOut, f.outDur || 0.9); } if (f.fx === 'shatter') maxOut = Math.max(maxOut, f.outDur || 1.2); });
    if (p.write) maxIn = Math.max(maxIn, p.write.dur);
    var speed = (o && o.speed) || 1;
    var hold = loop ? 2.6 : 1.4;
    return { inDur: maxIn / speed, outDur: maxOut / speed, total: (maxIn + maxOut) / speed + hold + 0.35, pad: 0.15 };
  }

  /* ---------------- layout ---------------- */

  function layout(ctx, p, o) {
    var st = p.style || {};
    var size = (o.size || st.size || 100);
    var fontCss = (CQ.presets.FONTS[o.font || p.font] || {}).css || 'sans-serif';
    var text = o.text != null ? o.text : p.sample;
    if (st.caps && o.keepCase !== true) text = text.toUpperCase();
    var lines = String(text).split(/\r\n|\r|\n/);
    var trackingBase = (st.tracking || 0) / 1000 * size;
    ctx.font = size + 'px "' + fontCss + '"';
    var chars = [];
    var ci = 0, wi = -1, prevSpace = true, nsIndex = 0;
    lines.forEach(function (line, li) {
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        var space = /\s/.test(ch);
        if (!space && prevSpace) wi++;
        prevSpace = space;
        chars.push({ ch: ch, line: li, idx: ci, word: space ? -1 : wi, ns: space ? -1 : nsIndex, space: space, w: ctx.measureText(ch).width });
        ci++;
        if (!space) nsIndex++;
      }
      // After Effects counts the line break as a character
      if (li < lines.length - 1) { ci++; prevSpace = true; }
    });
    var m = ctx.measureText('H');
    var capH = (m.actualBoundingBoxAscent || size * 0.7);
    return { chars: chars, lines: lines.length, size: size, fontCss: fontCss, tracking: trackingBase, capH: capH, leading: (st.leading || 1.12) * size, totals: { chars: ci, ns: nsIndex, words: wi + 1, lines: lines.length } };
  }

  /* ---------------- animator evaluation ---------------- */

  function unitOf(c, based) {
    if (based === 'words') return c.word;
    if (based === 'lines') return c.line;
    if (based === 'charsNoSpace') return c.ns;
    return c.idx;
  }
  function totalOf(L, based) {
    if (based === 'words') return L.totals.words;
    if (based === 'lines') return L.totals.lines;
    if (based === 'charsNoSpace') return L.totals.ns;
    return L.totals.chars;
  }

  function evaluate(p, L, t, inP, outP, speed) {
    var anims = CQ.presets.normalize(p);
    var fns = anims.map(function (a) {
      var tt = {}; for (var k in a.t) tt[k] = a.t[k];
      if (speed && speed !== 1) {
        if (tt.dur) tt.dur /= speed; if (tt.outDur) tt.outDur /= speed; if (tt.delay) tt.delay /= speed;
      }
      return CQ.expr.compileAmount(tt);
    });
    var st = p.style || {};
    var base = hex(st.fill || '#ffffff');
    L.chars.forEach(function (c) {
      var s = { px: 0, py: 0, sx: 100, sy: 100, rot: 0, op: 100, bx: 0, by: 0, trk: 0, fill: base.slice(), fillOp: 100, skew: 0, off: 0 };
      if (st.lineColors && st.lineColors[c.line]) s.fill = hex(st.lineColors[c.line]);
      if (c.lineFill) s.fill = hex(c.lineFill);
      anims.forEach(function (a, ai) {
        var u = unitOf(c, a.based);
        if (u < 0) return; // spaces are not part of word units
        var amt = fns[ai](u + 1, totalOf(L, a.based), t, inP, outP);
        if (!isFinite(amt) || amt === 0) return;
        var pr = a.props;
        if (pr.position) { s.px += pr.position[0] * amt; s.py += pr.position[1] * amt; }
        if (pr.scale) { s.sx *= (1 + (pr.scale[0] / 100 - 1) * amt); s.sy *= (1 + (pr.scale[1] / 100 - 1) * amt); }
        if (pr.rotation) s.rot += pr.rotation * amt;
        if (pr.opacity != null) s.op *= Math.max(0, Math.min(1, 1 + (pr.opacity / 100 - 1) * amt));
        if (pr.fillOpacity != null) s.fillOp *= Math.max(0, Math.min(1, 1 + (pr.fillOpacity / 100 - 1) * amt));
        if (pr.blur) { s.bx += Math.abs(pr.blur[0] * amt); s.by += Math.abs(pr.blur[1] * amt); }
        if (pr.tracking) s.trk += pr.tracking * amt;
        if (pr.skew) s.skew += pr.skew * amt;
        if (pr.charOffset) s.off += Math.round(pr.charOffset * amt);
        if (pr.fill) { var k = Math.max(0, Math.min(1, amt)); s.fill = mix(s.fill, pr.fill, k); }
      });
      c.s = s;
    });
  }

  function positions(L, justify) {
    // line widths include per-character tracking (centred paragraph, like AE)
    var lineW = [], i;
    for (i = 0; i < L.lines; i++) lineW[i] = 0;
    L.chars.forEach(function (c) { c.adv = c.w + L.tracking + c.s.trk / 1000 * L.size; lineW[c.line] += c.adv; });
    var xs = [], maxW = 0;
    for (i = 0; i < L.lines; i++) maxW = Math.max(maxW, lineW[i] - L.tracking);
    for (i = 0; i < L.lines; i++) {
      var lw = lineW[i] - L.tracking;
      xs[i] = justify === 'left' ? -maxW / 2 : justify === 'right' ? maxW / 2 - lw : -lw / 2;
    }
    var blockH = (L.lines - 1) * L.leading;
    L.chars.forEach(function (c) {
      c.x = xs[c.line] + c.w / 2; xs[c.line] += c.adv;
      c.y = -blockH / 2 + c.line * L.leading + L.capH / 2; // baseline
    });
    var minX = Infinity, maxX = -Infinity;
    minX = -maxW / 2; maxX = maxW / 2;
    L.box = { x: minX, y: -blockH / 2 - L.capH / 2, w: maxX - minX, h: blockH + L.capH };
    L.lineW = lineW;
  }

  /* ---------------- drawing ---------------- */

  function drawChars(ctx, p, L, opts) {
    var st = p.style || {};
    var stroke = opts.stroke || st.stroke;
    ctx.font = L.size + 'px "' + L.fontCss + '"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    L.chars.forEach(function (c) {
      if (c.space) return;
      var s = c.s;
      if (s.op <= 0.001 || s.sx === 0 || s.sy === 0) return;
      var ch = c.ch;
      if (s.off) {
        var code = ch.charCodeAt(0);
        if (code >= 65 && code <= 90) ch = String.fromCharCode(65 + (((code - 65 + s.off) % 26) + 26) % 26);
        else if (code >= 97 && code <= 122) ch = String.fromCharCode(97 + (((code - 97 + s.off) % 26) + 26) % 26);
      }
      ctx.save();
      ctx.globalAlpha = Math.min(1, s.op);
      var cy = c.y - L.capH / 2; // anchor: vertical centre of the character
      ctx.translate(c.x + s.px, cy + s.py);
      if (s.rot) ctx.rotate(s.rot * Math.PI / 180);
      if (s.skew) ctx.transform(1, 0, -Math.tan(s.skew * Math.PI / 180), 1, 0, 0);
      ctx.scale(s.sx / 100, s.sy / 100);
      var blur = Math.max(s.bx, s.by);
      if (blur > 0.5 && opts.allowBlur !== false) ctx.filter = 'blur(' + (blur * opts.scale * 0.5).toFixed(1) + 'px)';
      var fill = opts.fillOverride || 'rgb(' + Math.round(s.fill[0]) + ',' + Math.round(s.fill[1]) + ',' + Math.round(s.fill[2]) + ')';
      // same order as After Effects: fill over stroke unless the preset says otherwise
      var drawFill = function () {
        if (s.fillOp > 0.001 && !opts.strokeOnly) {
          ctx.globalAlpha = Math.min(1, s.op) * s.fillOp;
          ctx.fillStyle = fill;
          ctx.fillText(ch, 0, L.capH / 2);
        }
      };
      var drawStroke = function () {
        if (stroke && stroke.width) {
          ctx.globalAlpha = Math.min(1, s.op);
          ctx.lineWidth = stroke.width;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = opts.fillOverride || rgba(stroke.color || '#fff');
          ctx.strokeText(ch, 0, L.capH / 2);
        }
      };
      if (stroke && stroke.over === false) { drawFill(); drawStroke(); } else { drawStroke(); drawFill(); }
      ctx.restore();
    });
  }

  /* ---------------- effects ---------------- */

  function glowPass(dst, src, color, radius, intensity, scale, textColor) {
    var g = canvas(src.width, src.height);
    var gc = g.getContext('2d');
    gc.filter = 'blur(' + Math.max(1, radius * scale * 0.55).toFixed(1) + 'px)';
    gc.drawImage(src, 0, 0);
    gc.filter = 'none';
    if (color && color !== 'auto') {
      gc.globalCompositeOperation = 'source-in';
      gc.fillStyle = rgba(color);
      gc.fillRect(0, 0, g.width, g.height);
    }
    var d = dst.getContext('2d');
    d.save();
    d.globalCompositeOperation = 'lighter';
    var reps = Math.max(1, Math.round(intensity * 1.6));
    d.globalAlpha = Math.min(1, intensity / reps * 1.2);
    for (var i = 0; i < reps; i++) d.drawImage(g, 0, 0);
    d.restore();
  }

  function noiseTex(w, h, cell, seed, t) {
    var c = canvas(w, h), x = c.getContext('2d');
    var cs = Math.max(2, cell);
    for (var yy = 0; yy < h; yy += cs) {
      for (var xx = 0; xx < w; xx += cs) {
        var v = rnd(Math.floor(xx / cs) * 131 + Math.floor(yy / cs) * 17 + Math.floor(t * 8) * 7, seed);
        x.fillStyle = 'rgba(0,0,0,' + (v * 0.85).toFixed(3) + ')';
        x.fillRect(xx, yy, cs, cs);
      }
    }
    return c;
  }

  function applyFx(layer, p, L, env) {
    var lc = layer.getContext('2d');
    var w = layer.width, h = layer.height, sc = env.scale;
    var fxs = p.fx || [];
    var out = canvas(w, h);
    var oc = out.getContext('2d');
    var glows = [];
    var shadows = [];
    var lt = env.t - env.inP, lo = env.outP - env.t;

    fxs.forEach(function (f) {
      var k, i;
      switch (f.fx) {
        case 'ramp': {
          var cx = w / 2 + L.box.x * sc * env.ls, cy = h / 2 + L.box.y * sc * env.ls;
          var gr = f.dir === 'horizontal'
            ? lc.createLinearGradient(cx, 0, cx + L.box.w * sc * env.ls, 0)
            : lc.createLinearGradient(0, cy, 0, cy + L.box.h * sc * env.ls);
          gr.addColorStop(0, rgba(f.c1)); gr.addColorStop(1, rgba(f.c2));
          lc.save(); lc.globalCompositeOperation = 'source-atop'; lc.fillStyle = gr; lc.fillRect(0, 0, w, h); lc.restore();
          break;
        }
        case 'texture': {
          var tex = noiseTex(w, h, Math.max(2, (f.scale || 20) * sc * 0.4), 5, lt * (f.speed || 1));
          lc.save(); lc.globalCompositeOperation = 'source-atop'; lc.globalAlpha = f.amount || 0.4; lc.drawImage(tex, 0, 0);
          lc.globalAlpha = (f.amount || 0.4) * 0.5; lc.fillStyle = rgba(f.color || '#ff5a2a'); lc.fillRect(0, 0, w, h); lc.restore();
          break;
        }
        case 'bevel':
        case 'emboss': {
          var hi = canvas(w, h), hc = hi.getContext('2d');
          hc.drawImage(layer, 0, 0);
          hc.globalCompositeOperation = 'destination-out';
          hc.drawImage(layer, 2 * sc + 1, 2 * sc + 1);
          lc.save(); lc.globalCompositeOperation = 'source-atop'; lc.globalAlpha = 0.85;
          var hb = canvas(w, h), hbc = hb.getContext('2d'); hbc.drawImage(hi, 0, 0); hbc.globalCompositeOperation = 'source-in'; hbc.fillStyle = '#fff'; hbc.fillRect(0, 0, w, h);
          lc.drawImage(hb, 0, 0); lc.restore();
          break;
        }
        case 'mosaic': {
          var md = (f.dur || 0.7) / env.speed;
          var prog = cl(lt / md), progOut = cl(lo / (md * 0.7));
          var amount = 1 - Math.min(prog, progOut);
          if (amount > 0.02) {
            var bs = Math.max(1, Math.round(w / (f.blocks || 18) * amount));
            var small = canvas(Math.ceil(w / bs), Math.ceil(h / bs)), smc = small.getContext('2d');
            smc.drawImage(layer, 0, 0, small.width, small.height);
            lc.clearRect(0, 0, w, h); lc.imageSmoothingEnabled = false; lc.drawImage(small, 0, 0, w, h); lc.imageSmoothingEnabled = true;
          }
          break;
        }
        case 'sliceJitter': {
          var until = (f.until || 0.7) / env.speed;
          var active = lt < until || lo < until * 0.6;
          if (active) {
            var copy = canvas(w, h); copy.getContext('2d').drawImage(layer, 0, 0);
            lc.clearRect(0, 0, w, h);
            var strips = 9, sh = h / strips, fr = Math.floor(env.t * 20);
            for (i = 0; i < strips; i++) {
              var off = (rnd(i * 7 + fr, 9) < 0.35) ? (rnd(i + fr * 3, 4) * 2 - 1) * (f.amount || 40) * sc : 0;
              lc.drawImage(copy, 0, i * sh, w, sh, off, i * sh, w, sh);
            }
          }
          break;
        }
        case 'wave': {
          var settle = (f.settle || 1.2) / env.speed;
          var ampK = 1 - cl(lt / settle) + (1 - cl(lo / settle));
          if (ampK > 0.01) {
            var cp = canvas(w, h); cp.getContext('2d').drawImage(layer, 0, 0);
            lc.clearRect(0, 0, w, h);
            var cols = 48, cw = w / cols;
            for (i = 0; i < cols; i++) {
              var dy = Math.sin(i / cols * Math.PI * 2 * (w / ((f.width || 140) * sc * 6)) + env.t * (f.speed || 2) * 3) * (f.height || 10) * sc * ampK;
              lc.drawImage(cp, i * cw, 0, cw + 1, h, i * cw, dy, cw + 1, h);
            }
          }
          break;
        }
        case 'burn': {
          var bd = (f.dur || 0.9) / env.speed, bo = (f.outDur || 0.9) / env.speed;
          var burn = Math.max(1 - cl(lt / bd), 1 - cl(lo / bo));
          if (burn > 0.001) {
            var bw = canvas(w, h), bc = bw.getContext('2d');
            var cell = Math.max(3, 9 * sc);
            var cx0 = w / 2, cy0 = h / 2, maxR = Math.sqrt(cx0 * cx0 + cy0 * cy0);
            for (var by2 = 0; by2 < h; by2 += cell) {
              for (var bx2 = 0; bx2 < w; bx2 += cell) {
                var dist = Math.sqrt(Math.pow(bx2 - cx0, 2) + Math.pow(by2 - cy0, 2)) / maxR;
                var n = rnd(Math.floor(bx2 / cell) * 91 + Math.floor(by2 / cell) * 13, 2) * 0.55 + dist * 0.45;
                if (n < burn) { bc.fillStyle = '#000'; bc.fillRect(bx2, by2, cell, cell); }
                else if (n < burn + 0.07) { bc.fillStyle = 'rgba(255,120,30,0.9)'; bc.fillRect(bx2, by2, cell, cell); }
              }
            }
            var ember = canvas(w, h), ec = ember.getContext('2d');
            ec.drawImage(bw, 0, 0); ec.globalCompositeOperation = 'destination-in'; ec.drawImage(layer, 0, 0);
            lc.save(); lc.globalCompositeOperation = 'destination-out';
            var hole = canvas(w, h), hcx = hole.getContext('2d'); hcx.drawImage(bw, 0, 0); hcx.globalCompositeOperation = 'source-in'; hcx.fillStyle = '#000'; hcx.fillRect(0, 0, w, h);
            lc.drawImage(hole, 0, 0); lc.restore();
            lc.save(); lc.globalCompositeOperation = 'lighter'; lc.drawImage(ember, 0, 0); lc.restore();
          }
          break;
        }
        case 'shatter': {
          var so = (f.outDur || 1.2) / env.speed;
          var sp = 1 - cl(lo / so);
          if (sp > 0.001) {
            var src = canvas(w, h); src.getContext('2d').drawImage(layer, 0, 0);
            lc.clearRect(0, 0, w, h);
            var gx = 14, gy = 6, pw = w / gx, ph = h / gy;
            for (var yi = 0; yi < gy; yi++) for (var xi = 0; xi < gx; xi++) {
              var r1 = rnd(xi * 31 + yi * 7, 6), r2 = rnd(xi * 11 + yi * 3, 8);
              var dx = (xi - gx / 2) * pw * sp * (1.5 + r1 * 2), dyy = (yi - gy / 2) * ph * sp * 2 + sp * sp * h * 0.8;
              lc.save(); lc.globalAlpha = 1 - sp * 0.8;
              lc.translate(xi * pw + pw / 2 + dx, yi * ph + ph / 2 + dyy); lc.rotate((r2 - 0.5) * sp * 6);
              lc.drawImage(src, xi * pw, yi * ph, pw, ph, -pw / 2, -ph / 2, pw, ph); lc.restore();
            }
          }
          break;
        }
        case 'rgbSplit': {
          var on = f.until ? (lt < f.until / env.speed || lo < f.until / env.speed * 0.6) : true;
          var amt = (f.amount || 6) * sc * (on ? 1 : 0.35) * (f.until ? (0.6 + rnd(Math.floor(env.t * 18), 3)) : 1);
          shadows.push({ color: '#ff1a3c', dx: -amt, dy: 0, blur: 0, a: 0.9, screen: true });
          shadows.push({ color: '#1a6bff', dx: amt, dy: 0, blur: 0, a: 0.9, screen: true });
          break;
        }
        case 'shadow':
          shadows.push({ color: f.color || '#000', dx: (f.distance || 0) * sc * 0.7, dy: (f.distance || 0) * sc * 0.7, blur: (f.softness || 0) * sc * 0.5, a: (f.opacity == null ? 75 : f.opacity) / 100 });
          break;
        case 'glow':
          glows.push(f);
          break;
        case 'plugin': {
          var pv = f.previewAs;
          if (pv === 'emboss') applyFx(layer, { fx: [{ fx: 'emboss' }, { fx: 'texture', color: f.color, amount: 0.35, scale: 14, speed: 0.5 }] }, L, env);
          else if (pv === 'spots' || pv === 'cells') {
            var tx = canvas(w, h), tc = tx.getContext('2d');
            var cnt = pv === 'spots' ? 70 : 40;
            for (i = 0; i < cnt; i++) {
              var rx = rnd(i, 3) * w, ry = rnd(i, 5) * h, rr = (pv === 'spots' ? 6 + rnd(i, 7) * 14 : 18 + rnd(i, 9) * 26) * sc;
              rx += Math.sin(env.t * 1.5 + i) * 6 * sc; ry += Math.cos(env.t * 1.2 + i) * 6 * sc;
              tc.beginPath(); tc.arc(rx, ry, rr, 0, Math.PI * 2);
              if (pv === 'spots') { tc.fillStyle = 'rgba(0,0,0,0.55)'; tc.fill(); }
              else { tc.strokeStyle = 'rgba(255,255,255,0.55)'; tc.lineWidth = 2 * sc; tc.stroke(); }
            }
            lc.save(); lc.globalCompositeOperation = 'source-atop'; lc.drawImage(tx, 0, 0); lc.restore();
          } else if (pv === 'rays') {
            glows.push({ color: f.color || '#ff2a2a', radius: 40, intensity: 0.8 });
          } else if (f.plugin === 'deepglow') {
            glows.push({ color: 'auto', radius: 18, intensity: 1.2 });
            glows.push({ color: 'auto', radius: 90, intensity: 0.9 });
          }
          break;
        }
      }
    });

    // shadows / channel split behind the text
    shadows.forEach(function (s) {
      var sh = canvas(w, h), sc2 = sh.getContext('2d');
      if (s.blur > 0.5) sc2.filter = 'blur(' + s.blur.toFixed(1) + 'px)';
      sc2.drawImage(layer, s.dx, s.dy); sc2.filter = 'none';
      sc2.globalCompositeOperation = 'source-in'; sc2.fillStyle = rgba(s.color); sc2.fillRect(0, 0, w, h);
      oc.save(); oc.globalAlpha = s.a; if (s.screen) oc.globalCompositeOperation = 'lighter'; oc.drawImage(sh, 0, 0); oc.restore();
    });
    oc.drawImage(layer, 0, 0);
    // glow on top (AE Glow composites the glow over the original)
    var base = canvas(w, h); base.getContext('2d').drawImage(out, 0, 0);
    glows.forEach(function (g) {
      var color = g.color;
      if (g.flash) {
        var fl = (lt > 0.25 / env.speed && lt < 0.45 / env.speed);
        if (fl) color = g.flash;
      }
      glowPass(out, base, color, g.radius || 20, g.intensity == null ? 1 : g.intensity, sc * env.ls);
    });
    return out;
  }

  /* ---------------- extras (shape layers) ---------------- */

  function extras(ctx, p, L, env) {
    var sc = env.scale * env.ls;
    var lt = env.t - env.inP, lo = env.outP - env.t;
    var b = L.box;
    var outK = (function () { var od = 0.4 / env.speed; return cl(lo / od); })();
    (p.extras || []).forEach(function (e) {
      var d = (e.dur || 0.5) / env.speed, dl = (e.delay || 0) / env.speed;
      var k = easeOut((lt - dl) / d);
      var col = rgba(e.color || '#fff');
      ctx.save();
      ctx.globalAlpha *= outK;
      var pad = e.pad || [30, 16];
      var x = b.x - pad[0], y = b.y - pad[1], w = b.w + pad[0] * 2, h = b.h + pad[1] * 2;
      switch (e.type) {
        case 'captionBox': {
          ctx.globalAlpha = (e.opacity == null ? 0.65 : e.opacity) * outK * Math.min(1, cl(lt / 0.12));
          ctx.fillStyle = col;
          var rr = Math.min(e.round || 0, h / 2, w / 2);
          ctx.beginPath();
          ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr); ctx.lineTo(x + w, y + h - rr);
          ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h); ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
          ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y); ctx.closePath(); ctx.fill();
          break;
        }
        case 'box': {
          var kk = expoOut((lt - dl) / d);
          ctx.fillStyle = col;
          ctx.fillRect(x + w / 2 * (1 - kk), y + h / 2 * (1 - Math.min(1, kk * 1.6)), w * kk, h * Math.min(1, kk * 1.6));
          break;
        }
        case 'outlineBox': {
          var ext = e.followTracking ? (1 - expoOut(lt / d)) * b.w * 0.35 : 0;
          ctx.strokeStyle = col; ctx.lineWidth = e.width || 4;
          ctx.globalAlpha *= cl(lt / (d * 0.3));
          ctx.strokeRect(x - ext, y, w + ext * 2, h);
          break;
        }
        case 'spinLine': {
          var ang = (1 - k) * Math.PI * 1.5;
          ctx.strokeStyle = col; ctx.lineWidth = e.width || 5;
          var len = (b.w / 2 + 40) * (lt < d ? 1 : 0);
          ctx.globalAlpha *= lt < d ? 1 : 0;
          ctx.rotate(-ang * 0.6);
          ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(len, 0); ctx.stroke();
          break;
        }
        case 'dashes': {
          ctx.strokeStyle = col; ctx.lineWidth = Math.max(4, L.size * 0.08);
          L.chars.forEach(function (c) {
            if (c.space) return;
            if (c.s.op > 0.5) return;
            ctx.beginPath(); ctx.moveTo(c.x - c.w * 0.3, c.y - L.capH * 0.45); ctx.lineTo(c.x + c.w * 0.3, c.y - L.capH * 0.45); ctx.stroke();
          });
          break;
        }
        case 'echoRows': {
          var ek = easeOut((lt - dl) / d);
          ctx.globalAlpha *= ek;
          ctx.font = L.size + 'px "' + L.fontCss + '"'; ctx.textAlign = 'center';
          ctx.strokeStyle = col; ctx.lineWidth = e.width || 2;
          var txt = L.chars.map(function (c) { return c.ch; }).join('');
          var tw = b.w + L.size * 0.4;
          for (var r = -e.rows; r <= e.rows; r++) {
            for (var cix = -3; cix <= 3; cix++) {
              if (r === 0 && cix === 0) continue;
              var shift = (r % 2 ? 1 : -1) * (1 - ek) * tw * 0.5 + (r % 2 ? lt * 40 : -lt * 40);
              ctx.strokeText(txt, cix * tw + shift, r * L.leading * 0.95 + L.capH / 2 + (b.y + b.h / 2));
            }
          }
          break;
        }
        case 'sweepBlock': {
          var p1 = cl((lt - dl) / (d * 0.5)), p2 = cl((lt - dl - d * 0.5) / (d * 0.5));
          var e1 = easeOut(p1), e2 = easeOut(p2);
          ctx.fillStyle = col;
          ctx.fillRect(x + w * e2, y, w * (e1 - e2), h);
          break;
        }
        case 'drip': {
          var dk = cl((lt - dl) / d);
          var ci = Math.floor(L.chars.length * (e.at || 0.3));
          var c = L.chars[Math.min(L.chars.length - 1, ci)];
          if (c) {
            var len = (e.len || 60) * (0.5 + 0.5 * Math.sin(dk * Math.PI)) * Math.min(1, dk * 3);
            var top = c.y - 4, wd = e.width || 6;
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(c.x - wd / 2, top); ctx.lineTo(c.x + wd / 2, top); ctx.lineTo(c.x + wd / 2, top + len);
            ctx.arc(c.x, top + len, wd / 2, 0, Math.PI); ctx.closePath(); ctx.fill();
          }
          break;
        }
        case 'line': {
          var ly = e.at === 'bottom' ? b.y + b.h + L.size * 0.15 : b.y - L.size * 0.15;
          var lw = (b.w * 0.75) * expoOut((lt - dl) / d);
          ctx.strokeStyle = col; ctx.lineWidth = e.width || 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-lw / 2, ly); ctx.lineTo(lw / 2, ly); ctx.stroke();
          break;
        }
        case 'swoosh': {
          var sk = easeOut((lt - dl) / d);
          var sy = b.y + b.h + L.size * 0.2;
          ctx.strokeStyle = col; ctx.lineWidth = e.width || 4; ctx.lineCap = 'round';
          ctx.beginPath();
          var x0 = -b.w * 0.4, x1 = x0 + b.w * 0.8 * sk;
          ctx.moveTo(x0, sy); ctx.quadraticCurveTo((x0 + x1) / 2, sy + 10, x1, sy - 4 * sk);
          ctx.stroke();
          break;
        }
        case 'laserLines': {
          var lk = cl((lt - dl) / d);
          if (lk < 1) {
            ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.shadowColor = col; ctx.shadowBlur = 20 * sc;
            for (var li = 0; li < (e.count || 3); li++) {
              var lx = b.x + b.w * ((li + 0.5) / (e.count || 3));
              var top2 = -540, bot = -540 + 1300 * expoOut(lk);
              ctx.globalAlpha = (1 - lk) * outK;
              ctx.beginPath(); ctx.moveTo(lx, top2); ctx.lineTo(lx, bot); ctx.stroke();
            }
          }
          break;
        }
        case 'dashline': {
          var dk2 = easeOut((lt - dl) / d);
          ctx.strokeStyle = col; ctx.lineWidth = e.width || 2; ctx.setLineDash([6, 6]);
          var yy = b.y + b.h + L.size * 0.18, ww = b.w * 0.8 * dk2;
          ctx.beginPath(); ctx.moveTo(-ww / 2, yy); ctx.lineTo(ww / 2, yy); ctx.stroke();
          break;
        }
        case 'chevrons': {
          var ck = easeOut((lt - dl) / d);
          ctx.strokeStyle = col; ctx.lineWidth = e.width || 3; ctx.lineJoin = 'miter';
          for (var cc = 0; cc < 3; cc++) {
            var cyy = b.y - L.size * 0.35 - cc * L.size * 0.22 * ck;
            ctx.globalAlpha = outK * ck * (1 - cc * 0.25);
            ctx.beginPath(); ctx.moveTo(-L.size * 0.4, cyy + L.size * 0.22); ctx.lineTo(0, cyy); ctx.lineTo(L.size * 0.4, cyy + L.size * 0.22); ctx.stroke();
          }
          break;
        }
        case 'brackets': {
          var bk = expoOut((lt - dl) / d);
          var ox = (1 - bk) * 60, arm = Math.min(w, h) * 0.45 * bk;
          ctx.strokeStyle = col; ctx.lineWidth = e.width || 3;
          ctx.beginPath();
          ctx.moveTo(x - ox + arm, y - ox); ctx.lineTo(x - ox, y - ox); ctx.lineTo(x - ox, y - ox + arm);
          ctx.moveTo(x + w + ox - arm, y + h + ox); ctx.lineTo(x + w + ox, y + h + ox); ctx.lineTo(x + w + ox, y + h + ox - arm);
          ctx.stroke();
          break;
        }
      }
      ctx.restore();
    });
  }

  /* ---------------- frame ---------------- */

  function renderFrame(cv, p, opts) {
    var o = opts || {};
    var ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    var VW = o.frameW || 1920, VH = o.frameH || 1080;   // virtual composition size
    var scale = Math.min(W / VW, H / VH);
    var speed = o.speed || 1;
    var tl = o.timeline || timeline(p, o);
    var inP = tl.pad, outP = tl.total - tl.pad;
    var t = o.time == null ? 0 : o.time;

    // background
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (o.transparent) ctx.clearRect(0, 0, W, H);
    else {
      var bg = o.bg || p.bg || '#000';
      var g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      var bh = hex(bg);
      g.addColorStop(0, rgba([Math.min(255, bh[0] + 14), Math.min(255, bh[1] + 14), Math.min(255, bh[2] + 20)]));
      g.addColorStop(1, rgba(bg));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    var lay = canvas(W, H);
    var lc = lay.getContext('2d');
    var L = layout(lc, p, o);
    evaluate(p, L, t, inP, outP, speed);
    positions(L, o.justify);

    // fit long text into the frame
    var fit = o.noFit ? 1 : Math.min(o.maxFit || 1, (VW * (o.fitWidth || 0.86)) / Math.max(1, L.box.w), (VH * (o.fitHeight || 0.6)) / Math.max(1, L.box.h));
    var ls = fit;

    // layer transform (scale punch, tilt) from layer expressions
    var lt = t - inP;
    var lscale = 1, lrot = 0;
    if (p.layer && p.layer.scale) {
      var ls1 = p.layer.scale;
      var k = (ls1.ease === 'expoOut' ? expoOut : easeOut)(lt / ((ls1.dur || 0.4) / speed));
      lscale = (ls1.from / 100) + (1 - ls1.from / 100) * k;
    }
    if (p.layer && p.layer.rotation) {
      var keys = p.layer.rotation.keys;
      var a0 = keys[0], a1 = keys[1];
      var kr = cl((lt - a0[0] / speed) / ((a1[0] - a0[0]) / speed));
      if (p.layer.rotation.ease === 'backOut') { var c1 = 1.70158, c3 = c1 + 1; kr = kr <= 0 ? 0 : 1 + c3 * Math.pow(kr - 1, 3) + c1 * Math.pow(kr - 1, 2); }
      lrot = a0[1] + (a1[1] - a0[1]) * kr;
    }
    if (o.position) { /* caption position preview */ }

    lc.save();
    var tx = VW / 2 + (o.offsetX || 0), ty = VH / 2 + (o.offsetY || 0);
    if (o.place) {
      // caption placement: box edge sits `margin` px from the frame edge
      var mg = o.place.margin || 0, B = L.box, k2 = ls;
      if (o.place.v === 'top') ty = mg - B.y * k2; else if (o.place.v === 'bottom') ty = VH - mg - (B.y + B.h) * k2; else ty = VH / 2 - (B.y + B.h / 2) * k2;
      if (o.place.h === 'left') tx = mg - B.x * k2; else if (o.place.h === 'right') tx = VW - mg - (B.x + B.w) * k2; else tx = VW / 2 - (B.x + B.w / 2) * k2;
    }
    lc.translate(tx * scale, ty * scale);
    lc.scale(scale * ls * lscale, scale * ls * lscale);
    lc.rotate(lrot * Math.PI / 180);

    var env = { t: t, inP: inP, outP: outP, scale: scale, ls: ls * lscale, speed: speed };

    // shape layers drawn behind
    var behind = { box: 1, echoRows: 1, captionBox: 1, outlineBox: 0 };
    var pBehind = { extras: (p.extras || []).filter(function (e) { return behind[e.type]; }) };
    extras(lc, pBehind, L, env);

    var drawOpts = { scale: scale * ls, stroke: o.stroke };
    if (p.slices) {
      var sl = p.slices, sk = expoOut(lt / ((sl.dur || 0.8) / speed));
      var lo2 = outP - t, so = 1 - easeOut(lo2 / (0.5 / speed));
      [-1, 1].forEach(function (side) {
        lc.save();
        lc.beginPath();
        lc.rect(-VW, side < 0 ? -VH : L.box.y + L.box.h / 2, VW * 2, side < 0 ? VH + L.box.y + L.box.h / 2 : VH);
        lc.clip();
        lc.translate(side * (sl.offset || 300) * ((1 - sk) + so), 0);
        drawChars(lc, p, L, drawOpts);
        lc.restore();
      });
    } else if (p.clip === 'baseline') {
      lc.save();
      lc.beginPath();
      for (var li = 0; li < L.lines; li++) {
        var by = -((L.lines - 1) * L.leading) / 2 + li * L.leading + L.capH / 2 + L.size * 0.25;
        lc.rect(-VW, by - L.leading, VW * 2, L.leading);
      }
      lc.clip();
      drawChars(lc, p, L, drawOpts);
      lc.restore();
    } else if (p.write) {
      var wk = cl(lt / (p.write.dur / speed));
      lc.save();
      lc.beginPath();
      lc.rect(L.box.x - 20, -VH, (L.box.w + 40) * easeOut(wk), VH * 2);
      lc.clip();
      drawChars(lc, p, L, drawOpts);
      lc.restore();
      if (wk < 1) { // pen tip
        lc.fillStyle = '#fff'; lc.globalAlpha = 0.9;
        lc.beginPath(); lc.arc(L.box.x - 20 + (L.box.w + 40) * easeOut(wk), Math.sin(wk * 40) * L.capH * 0.3, 5, 0, Math.PI * 2); lc.fill();
        lc.globalAlpha = 1;
      }
    } else {
      drawChars(lc, p, L, drawOpts);
    }

    var front = { extras: (p.extras || []).filter(function (e) { return !behind[e.type]; }) };
    extras(lc, front, L, env);
    lc.restore();

    var fxd = applyFx(lay, p, L, env);
    ctx.drawImage(fxd, 0, 0);
    return { layout: L, timeline: tl };
  }

  /** Animated player bound to a canvas. */
  function Player(cv, preset, opts) {
    this.cv = cv; this.p = preset; this.o = opts || {}; this.t0 = 0; this.running = false; this.raf = 0;
    this.tl = timeline(preset, this.o);
    this.fps = this.o.fps || 30;
    this._last = 0;
  }
  Player.prototype.setPreset = function (p) { this.p = p; this.tl = timeline(p, this.o); };
  Player.prototype.setOptions = function (o) { for (var k in o) this.o[k] = o[k]; this.tl = timeline(this.p, this.o); if (!this.running) this.draw(this._t || this.tl.inDur + 0.5); };
  Player.prototype.draw = function (t) {
    this._t = t;
    var o = {}; for (var k in this.o) o[k] = this.o[k];
    o.time = t; o.timeline = this.tl;
    try { renderFrame(this.cv, this.p, o); } catch (e) { if (root.console) console.error('preview', this.p.id, e); }
  };
  Player.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    var self = this;
    var start = (root.performance ? performance.now() : Date.now()) - (this._t || 0) * 1000;
    function loop(now) {
      if (!self.running) return;
      if (now - self._last >= 1000 / self.fps - 2) {
        self._last = now;
        var t = ((now - start) / 1000) % self.tl.total;
        self.draw(t);
      }
      self.raf = root.requestAnimationFrame(loop);
    }
    this.raf = root.requestAnimationFrame(loop);
  };
  Player.prototype.stop = function (poster) {
    this.running = false;
    if (this.raf) root.cancelAnimationFrame(this.raf);
    if (poster) this.draw(this.tl.pad + this.tl.inDur + 0.4);
  };

  CQ.preview = { renderFrame: renderFrame, timeline: timeline, Player: Player, hex: hex, layout: layout };
})(typeof window !== 'undefined' ? window : global);

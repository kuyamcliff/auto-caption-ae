/*
 * CyriqCap builder: turns a preset (+ user options) into the request the host
 * script executes. All After Effects expressions are generated here, from the
 * same timing code the preview runs.
 */
(function (root) {
  'use strict';
  var CQ = root.CQ = root.CQ || {};
  var X = CQ.expr;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function n(v) { return X.num(v, 0); }
  function rgb1(hex) { var h = CQ.preview ? CQ.preview.hex(hex) : hexToRgb(hex); return '[' + n(h[0] / 255) + ',' + n(h[1] / 255) + ',' + n(h[2] / 255) + ',1]'; }
  function hexToRgb(c) { var s = String(c).replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]; var v = parseInt(s, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  var TAG = '/*CQ*/';

  function scaleTiming(t, speed) {
    var o = clone(t || {});
    if (speed && speed !== 1) {
      ['dur', 'outDur', 'delay', 'loopPeriod'].forEach(function (k) { if (o[k]) o[k] = o[k] / speed; });
    }
    return o;
  }

  /** Layer-level expression with progress helpers. */
  function L(opts, code) { return TAG + X.layerExpression(opts, code); }

  /**
   * options = {
   *   speed: 1, useFont: true, useColors: true, fill: '#hex' (override),
   *   glow: '#hex' (override), size: px@1080 (optional), keepText: true
   * }
   */
  function build(preset, options) {
    var o = options || {};
    var speed = Math.max(0.25, Math.min(4, Number(o.speed) || 1));
    var p = clone(preset);
    var st = p.style || {};
    var out = { id: p.id, name: p.name, needs: p.needs || [], plugins: {}, anims: [], fx: [], extras: [], layer: {} };

    (p.needs || []).forEach(function (k) { out.plugins[k] = CQ.presets.PLUGINS[k]; });

    // ---- style
    var style = {};
    if (o.useFont !== false) style.font = p.font;
    if (o.useColors !== false) style.fill = o.fill || st.fill;
    else if (o.fill) style.fill = o.fill;
    if (st.stroke) style.stroke = st.stroke;
    if (st.tracking != null) style.tracking = st.tracking;
    if (st.caps) style.caps = true;
    if (o.size) style.size = o.size;
    if (st.leading && o.useFont !== false) style.leading = st.leading;
    out.style = style;

    // ---- animators
    var anims = CQ.presets.normalize(p);
    anims.forEach(function (a, i) {
      var t = scaleTiming(a.t, speed);
      var props = clone(a.props);
      if (props.fill && o.useColors === false) return; // colour animators follow the user's colours
      out.anims.push({ based: a.based, props: props, expr: X.selectorExpression(t), label: (a.label || 'Anim ' + (i + 1)) });
    });
    // per-line colours (e.g. white first line, accent second line)
    if (st.lineColors && o.useColors !== false) {
      st.lineColors.forEach(function (c, li) {
        if (!c || (o.fill && li === st.lineColors.length - 1)) return;
        out.anims.unshift({ based: 'lines', props: { fill: c }, expr: X.selectorExpression({ phase: 'hold', select: { mod: 1000, eq: li } }), label: 'Line ' + (li + 1) + ' colour' });
      });
    }

    // ---- effects
    var inMax = 0, outMax = 0;
    anims.forEach(function (a) { var t = a.t || {}; inMax = Math.max(inMax, (t.dur || 0.8) + (t.delay || 0)); outMax = Math.max(outMax, t.outDur || t.dur || 0.8); });
    inMax /= speed; outMax /= speed;

    (p.fx || []).forEach(function (f) {
      var g = clone(f);
      switch (f.fx) {
        case 'glow':
          if (o.glow && f.color !== 'auto') g.color = o.glow;
          if (f.flash) g.exprA = L({ dur: 1 }, 'var base=' + rgb1(g.color) + ',fl=' + rgb1(f.flash) + ';\n(lt>' + n(0.25 / speed) + '&&lt<' + n(0.45 / speed) + ')?fl:base;');
          if (f.colorsFrom === 'text') { g.color = 'auto'; }
          break;
        case 'mosaic': {
          var md = (f.dur || 0.7) / speed;
          g.expr = L({ dur: md, outDur: md * 0.7, ease: 'linear' }, 'var a=1-Math.min(pin,pout);\nvar B=' + n(f.blocks || 18) + ';\na>0.02?Math.round(Math.min(4000,B/a)):4000;');
          break;
        }
        case 'sliceJitter': {
          var u = (f.until || 0.7) / speed;
          g.expr = L({ dur: 1 }, 'var on=(lt>=0&&lt<' + n(u) + ')||(lo>=0&&lo<' + n(u * 0.6) + ');\nvar fr=Math.floor(time*20);\non&&rnd(fr)<0.6?' + n(f.amount || 40) + '*thisComp.height/1080:0;');
          break;
        }
        case 'wave': {
          var se = (f.settle || 1.2) / speed;
          g.expr = L({ dur: se, outDur: se, ease: 'linear' }, 'var k=(1-pin)+(1-pout);\n' + n(f.height || 10) + '*thisComp.height/1080*Math.min(1,k);');
          break;
        }
        case 'burn':
          g.expr = L({ dur: (f.dur || 0.9) / speed, outDur: (f.outDur || 0.9) / speed, ease: 'cubicInOut' }, 'Math.max(1-pin,1-pout)*100;');
          break;
        case 'shatter':
          g.radiusExpr = L({ dur: 1, outDur: (f.outDur || 1.2) / speed, ease: 'linear' }, 'var s=1-pout;\ns>0?0.05+s*1.6:0;');
          break;
        case 'rgbSplit':
          if (f.until) {
            var uu = f.until / speed;
            g.distExpr = L({ dur: 1 }, 'var on=(lt<' + n(uu) + ')||(lo<' + n(uu * 0.6) + ');\nvar A=' + n(f.amount || 6) + '*thisComp.height/1080;\non?A*(0.6+rnd(Math.floor(time*18))):A*0.35;');
          }
          break;
      }
      out.fx.push(g);
    });

    if (p.write) {
      out.fx.unshift({ fx: 'linearWipe', expr: L({ dur: p.write.dur / speed, ease: 'cubicInOut', out: false }, '100*(1-pin);'), feather: 40 });
    }

    // ---- layer transforms
    if (p.layer && p.layer.scale) {
      var s = p.layer.scale;
      out.layer.scaleExpr = L({ dur: (s.dur || 0.4) / speed, ease: s.ease || 'expoOut', out: false }, 'var f=' + n(s.from / 100) + '+(1-' + n(s.from / 100) + ')*pin;\n[value[0]*f,value[1]*f];');
    }
    if (p.layer && p.layer.rotation) {
      var k = p.layer.rotation.keys;
      out.layer.rotationExpr = L({ delay: k[0][0] / speed, dur: (k[1][0] - k[0][0]) / speed, ease: p.layer.rotation.ease || 'cubicOut', out: false }, 'value+' + n(k[0][1]) + '+(' + n(k[1][1] - k[0][1]) + ')*(lt<0?0:pin);');
    }

    if (p.clip === 'baseline') out.mask = { pad: (st.size || 100) * 0.06 };
    if (p.slices) {
      var sl = p.slices, so = (sl.dur || 0.8) / speed;
      var base = 'var off=' + n(sl.offset || 300) + '*thisComp.height/1080;\nvar k=(1-pin)+(1-pout);\n';
      out.slices = {
        exprA: L({ dur: so, outDur: 0.5 / speed, ease: sl.ease || 'expoOut' }, base + '[value[0]-off*k,value[1]];'),
        exprB: L({ dur: so, outDur: 0.5 / speed, ease: sl.ease || 'expoOut' }, base + '[value[0]+off*k,value[1]];')
      };
    }

    // ---- helper layers
    (p.extras || []).forEach(function (e) { var b = buildExtra(e, p, speed, o); if (b) out.extras.push(b); });

    out.motionBlur = true;
    return out;
  }

  /** Expressions for helper shape/text layers. `r` = owner's sourceRect, `L` = owner layer. */
  function buildExtra(e, p, speed, o) {
    var d = (e.dur || 0.5) / speed, dl = (e.delay || 0) / speed;
    var color = (o.useColors === false && o.fill) ? o.fill : e.color;
    var pad = e.pad || [30, 16];
    var px = n(pad[0]) + '*thisComp.height/1080', py = n(pad[1]) + '*thisComp.height/1080';
    var lo = { delay: dl, dur: d, outDur: 0.4 / speed, ease: 'expoOut' };
    var C = 'var cx=r.left+r.width/2,cy=r.top+r.height/2,H=thisComp.height/1080;\n';
    var x = { type: e.type, color: color, width: e.width };
    var fadeOut = L({ dur: 0.01, outDur: 0.4 / speed }, 'lt<0?0:100*pout;');
    switch (e.type) {
      case 'box':
        x.sizeExpr = X.layerCore(lo) + '[(r.width+2*' + px + ')*pin*pout,(r.height+2*' + py + ')*Math.min(1,pin*1.6)*pout];';
        x.posExpr = '[r.left+r.width/2,r.top+r.height/2];';
        break;
      case 'outlineBox':
        x.sizeExpr = '[r.width+2*' + px + ',r.height+2*' + py + '];';
        x.posExpr = '[r.left+r.width/2,r.top+r.height/2];';
        x.opacityExpr = L({ dur: d * 0.3, outDur: 0.4 / speed }, '100*pin*pout;');
        break;
      case 'sweepBlock':
        x.sizeExpr = X.layerCore({ dur: 1 }) + 'function e(q){q=q<0?0:q>1?1:q;return 1-Math.pow(1-q,3);}\nvar D=' + n(d) + ',W=r.width+2*' + px + ';\nvar e1=e((lt-' + n(dl) + ')/(D*0.5)),e2=e((lt-' + n(dl) + '-D*0.5)/(D*0.5));\n[Math.max(0,W*(e1-e2)),r.height+2*' + py + '];';
        x.posExpr = X.layerCore({ dur: 1 }) + 'function e(q){q=q<0?0:q>1?1:q;return 1-Math.pow(1-q,3);}\nvar D=' + n(d) + ',W=r.width+2*' + px + ';\nvar e1=e((lt-' + n(dl) + ')/(D*0.5)),e2=e((lt-' + n(dl) + '-D*0.5)/(D*0.5));\n[r.left-' + px + '+W*e2+W*(e1-e2)/2,r.top+r.height/2];';
        break;
      case 'spinLine':
        x.paths = [C + 'var len=r.width/2+40*H;\ncreatePath([[cx-len,cy],[cx+len,cy]],[],[],false);'];
        x.anchorExpr = TAG + 'var L=thisLayer.parent;var r=L.sourceRectAtTime(time,false);[r.left+r.width/2,r.top+r.height/2];';
        x.rotationExpr = L(lo, '-(1-pin)*160;');
        x.opacityExpr = L({ dur: d }, '(lt>=0&&lt<' + n(d) + ')?100:0;');
        break;
      case 'line':
      case 'dashline':
        x.paths = [X.layerCore(lo) + C + 'var y=' + (e.at === 'top' ? 'r.top-0.15*r.height' : 'r.top+r.height+' + n(e.type === 'dashline' ? 18 : 15) + '*H') + ';\nvar w=r.width*' + (e.type === 'dashline' ? '0.8' : '0.75') + '*pin/2;\ncreatePath([[cx-w,y],[cx+w,y]],[],[],false);'];
        x.opacityExpr = fadeOut;
        break;
      case 'swoosh':
        x.paths = [C + 'var y=r.top+r.height+20*H,x0=cx-r.width*0.4,x1=cx+r.width*0.4;\ncreatePath([[x0,y],[x1,y-6*H]],[[0,0],[-r.width*0.3,14*H]],[[r.width*0.3,10*H],[0,0]],false);'];
        x.trimExpr = L(lo, '100*pin;');
        x.opacityExpr = fadeOut;
        break;
      case 'drip':
        x.fill = true;
        x.paths = [X.layerCore({ delay: dl, dur: d, ease: 'linear' }) + C + 'var X0=r.left+r.width*' + n(e.at || 0.3) + ',top=r.top+r.height*0.92,wd=' + n(e.width || 6) + '*H;\nvar k=pin<=0?0:Math.sin(pin*Math.PI)*0.5+0.5;var len=' + n(e.len || 60) + '*H*k*Math.min(1,pin*3);\ncreatePath([[X0-wd/2,top],[X0+wd/2,top],[X0+wd/2,top+len],[X0,top+len+wd/2],[X0-wd/2,top+len]],[],[],true);'];
        x.opacityExpr = fadeOut;
        break;
      case 'chevrons':
        x.paths = [0, 1, 2].map(function (i) {
          return X.layerCore(lo) + C + 'var s=r.height*0.45,y=r.top-s*0.6-' + i + '*s*0.45*pin;\ncreatePath([[cx-s*0.8,y+s*0.45],[cx,y],[cx+s*0.8,y+s*0.45]],[],[],false);';
        });
        x.opacityExpr = L(lo, '100*pin*pout;');
        break;
      case 'brackets':
        x.paths = ['a', 'b'].map(function (w) {
          var base = X.layerCore(lo) + C + 'var px=' + px + ',py=' + py + ',x0=r.left-px,y0=r.top-py,x1=r.left+r.width+px,y1=r.top+r.height+py;\nvar o=(1-pin)*60*H,arm=Math.min(x1-x0,y1-y0)*0.45*pin;\n';
          return base + (w === 'a'
            ? 'createPath([[x0-o+arm,y0-o],[x0-o,y0-o],[x0-o,y0-o+arm]],[],[],false);'
            : 'createPath([[x1+o-arm,y1+o],[x1+o,y1+o],[x1+o,y1+o-arm]],[],[],false);');
        });
        x.opacityExpr = fadeOut;
        break;
      case 'laserLines': {
        var cnt = e.count || 3;
        x.paths = [];
        for (var i = 0; i < cnt; i++) {
          x.paths.push(X.layerCore({ delay: dl, dur: d, ease: 'expoOut' }) + C + 'var lx=r.left+r.width*' + n((i + 0.5) / cnt) + ';\nvar top=cy-thisComp.height,bot=top+thisComp.height*2*pin;\ncreatePath([[lx,top],[lx,bot]],[],[],false);');
        }
        x.width = 6;
        x.glow = true;
        x.opacityExpr = L({ delay: dl, dur: d, ease: 'linear' }, 'lt<0?0:100*(1-pin);');
        break;
      }
      case 'dashes': {
        // same text on a copy, every glyph shown as a dash until the real letter appears
        var src = (p.anims || [])[0];
        var t = scaleTiming(src ? src.t : {}, speed);
        var inv = X.amountCore(t) + 'var v=(1-res)*100;\n[v,v,v];';
        x.expr = inv;
        x.text = null;
        x.dash = true;
        break;
      }
      case 'echoRows': {
        x.rows = [];
        var rows = e.rows || 2;
        for (var rr = -rows; rr <= rows; rr++) {
          if (rr === 0) continue;
          var dir = rr % 2 ? 1 : -1;
          x.rows.push(L({ delay: dl, dur: d, ease: 'cubicOut' }, 'var r=thisLayer.parent.sourceRectAtTime(time,false);\nvar sh=' + dir + '*((1-pin)*r.width*0.5+lt*40*thisComp.height/1080);\n[value[0]+sh,value[1]+' + rr + '*r.height*1.25];'));
        }
        x.opacityExpr = L({ delay: dl, dur: d, outDur: 0.4 / speed }, '100*pin*pout;');
        break;
      }
      default:
        return null;
    }
    return x;
  }

  /** Word-highlight expression for a caption layer (karaoke style). */
  function highlightExpr(words, mode) {
    var S = words.map(function (w) { return n(w.start); }), E = words.map(function (w) { return n(w.end); });
    return TAG + 'var S=[' + S.join(',') + '],E=[' + E.join(',') + '];var i=textIndex-1;\nvar on=' +
      (mode === 'progressive' ? 'time>=S[i]' : 'time>=S[i]&&time<E[i]') + ';\nvar v=on?100:0;\n[v,v,v];';
  }

  CQ.builder = { build: build, highlightExpr: highlightExpr };
  if (typeof module !== 'undefined' && module.exports) module.exports = CQ.builder;
})(typeof window !== 'undefined' ? window : global);

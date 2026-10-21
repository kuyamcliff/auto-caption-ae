/*
 * CyriqCap expression builder.
 *
 * Every per-character timing curve is written once, as an After Effects
 * expression body (ES3-compatible so it runs in both the legacy ExtendScript
 * and the JavaScript expression engines). The panel preview evaluates the very
 * same source, so what you see in the preview is what After Effects renders.
 *
 * Contract of a "core" body: plain statements that leave the result in `res`.
 *   - AE:      core + "\n[res,res,res];"     (expression selector amount)
 *   - preview: new Function(..., core + "\nreturn res;")
 */
(function (root) {
  'use strict';

  var EASES = {
    linear: 'function ez(p){p=cl(p);return p;}',
    sineOut: 'function ez(p){p=cl(p);return Math.sin(p*Math.PI/2);}',
    cubicOut: 'function ez(p){p=cl(p);return 1-Math.pow(1-p,3);}',
    quartOut: 'function ez(p){p=cl(p);return 1-Math.pow(1-p,4);}',
    expoOut: 'function ez(p){p=cl(p);return p>=1?1:1-Math.pow(2,-10*p);}',
    cubicInOut: 'function ez(p){p=cl(p);return p<0.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;}',
    backOut: 'function ez(p){p=cl(p);var c1=1.70158,c3=c1+1;return 1+c3*Math.pow(p-1,3)+c1*Math.pow(p-1,2);}',
    backOutStrong: 'function ez(p){p=cl(p);var c1=3.2,c3=c1+1;return 1+c3*Math.pow(p-1,3)+c1*Math.pow(p-1,2);}',
    elasticOut: 'function ez(p){p=cl(p);if(p===0||p===1)return p;return Math.pow(2,-10*p)*Math.sin((p*10-0.75)*(2*Math.PI/3))+1;}',
    bounceOut: 'function ez(p){p=cl(p);var n=7.5625,d=2.75;if(p<1/d)return n*p*p;if(p<2/d){p-=1.5/d;return n*p*p+0.75;}if(p<2.5/d){p-=2.25/d;return n*p*p+0.9375;}p-=2.625/d;return n*p*p+0.984375;}',
    step: 'function ez(p){return p>=1?1:0;}'
  };

  var ORDERS = {
    forward: 'function rk(i){return i;}',
    reverse: 'function rk(i){return N-1-i;}',
    center: 'function rk(i){var c=(N-1)/2;return Math.abs(i-c)*2;}',
    edges: 'function rk(i){var c=(N-1)/2;return (N-1)-Math.abs(i-c)*2;}',
    random: 'function rk(i){var k=rnd(i),r=0,j;for(j=0;j<N;j++){var q=rnd(j);if(q<k||(q===k&&j<i))r++;}return r;}'
  };

  function num(v, d) {
    var n = Number(v);
    if (!isFinite(n)) n = d;
    // keep expressions short and locale-proof
    return String(Math.round(n * 10000) / 10000);
  }

  var HELPERS =
    'function cl(p){return p<0?0:(p>1?1:p);}\n' +
    'function rnd(k){var x=Math.sin((k+1)*12.9898+SEED*78.233)*43758.5453;return x-Math.floor(x);}\n';

  /**
   * Where local time comes from.
   * Preview: real time relative to the layer's in/out points.
   * After Effects: two keyframed sliders on the text layer ("CQ In" 0->100 at
   * the start of the layer, "CQ Out" 0->100 at its end). Moving those
   * keyframes retimes the whole animation; every layer keeps its own keys.
   */
  function timeSource(env, delay) {
    var d = num(delay || 0, 0);
    if (!env || !env.ae) return 'var tin=time-inPoint-' + d + ',tout=outPoint-time;\n';
    var ref = env.src === 'parent' ? 'thisLayer.parent.' : '';
    return 'var tin=(' + ref + 'effect("CQ In")(1)/100)*' + num(env.inT * 1.002, 1) + '-' + d + ',tout=(1-' + ref + 'effect("CQ Out")(1)/100)*' + num(env.outT, 1) + ';\n';
  }

  /**
   * Build the amount curve for one animator.
   * timing = {
   *   phase: 'in' | 'out' | 'both' | 'loop' | 'hold',
   *   dur: seconds for the whole in-animation (all characters),
   *   outDur: seconds for the out-animation (default = dur),
   *   overlap: 0..1  (0 = one character after another, 1 = all together),
   *   order: forward|reverse|center|edges|random,
   *   outOrder: same as order by default,
   *   ease, outEase, seed,
   *   delay: seconds after the layer in-point before it starts
   *   flicker: {rate, until} hard random on/off during the in-phase
   *   loopPeriod: seconds (phase 'loop' -> sawtooth sweep 0..1 per character)
   * }
   * Result: 100 = fully "animated" state (hidden), 0 = rest.
   */
  function amountCore(timing, env) {
    var t = timing || {};
    var phase = t.phase || 'in';
    var dur = Math.max(0.01, Number(t.dur) || 0.8);
    var outDur = Math.max(0.01, Number(t.outDur) || dur);
    var overlap = t.overlap == null ? 0.35 : Math.min(1, Math.max(0, Number(t.overlap)));
    var order = ORDERS[t.order] ? t.order : 'forward';
    var outOrder = ORDERS[t.outOrder] ? t.outOrder : order;
    var ease = EASES[t.ease] ? t.ease : 'cubicOut';
    var outEase = EASES[t.outEase] ? t.outEase : ease;
    var seed = Math.round(Number(t.seed) || 7);
    var delay = Number(t.delay) || 0;

    var s = '';
    s += 'var N=textTotal,I=textIndex-1,SEED=' + seed + ';\n';
    s += HELPERS;
    s += ORDERS[order].replace('function rk(', 'function rkIn(') + '\n';
    s += ORDERS[outOrder].replace('function rk(', 'function rkOut(') + '\n';
    s += EASES[ease].replace('function ez(', 'function ezIn(') + '\n';
    s += EASES[outEase].replace('function ez(', 'function ezOut(') + '\n';
    s += timeSource(env, delay);
    var outOverlap = t.outOverlap == null ? overlap : Math.min(1, Math.max(0, Number(t.outOverlap)));
    s += 'var D=' + num(dur, 0.8) + ',DO=' + num(outDur, 0.8) + ',OV=' + num(overlap, 0.35) + ',OVO=' + num(outOverlap, 0.35) + ';\n';
    // per-character slot: with overlap 1 every char uses the full duration,
    // with overlap 0 the duration is split evenly.
    s += 'function slot(d,o){return N>1?d*(o+(1-o)/N):d;}\n';
    s += 'function start(d,r,o){return N>1?(d-slot(d,o))*(r/(N-1)):0;}\n';
    s += 'var res=0;\n';
    if (phase === 'in' || phase === 'both') {
      s += 'var pin=ezIn((tin-start(D,rkIn(I),OV))/slot(D,OV));\n';
      s += 'res=1-pin;\n';
      if (t.flicker) {
        var rate = num(t.flicker.rate || 18, 18);
        s += 'if(tin>=0&&tin<D*' + num(t.flicker.until || 1, 1) + '){var fk=Math.floor(tin*' + rate + ');var on=rnd(I*31+fk*7)>(1-cl(tin/(D*' + num(t.flicker.until || 1, 1) + ')));res=on?0:1;}\n';
        s += 'if(tin<0)res=1;\n';
      }
    }
    if (phase === 'out' || phase === 'both') {
      s += 'var pout=ezOut((tout-start(DO,rkOut(I),OVO))/slot(DO,OVO));\n';
      s += 'res=Math.max(res,1-pout);\n';
      s += 'if(tout<=0)res=1;\n';
    }
    if (phase === 'loop') {
      var per = num(t.loopPeriod || 2, 2);
      var spread = num(t.loopSpread == null ? 0.5 : t.loopSpread, 0.5);
      // travelling band: 1 when the sweep is on this character, 0 elsewhere
      s += 'var P=' + per + ',SP=' + spread + ';\n';
      s += 'var ph=(((time-inPoint)/P)%1+1)%1;var pos=ph*(1+SP*2)-SP;var x=N>1?I/(N-1):0.5;\n';
      s += 'var dd=Math.abs(x-pos)/SP;res=dd>=1?0:Math.cos(dd*Math.PI/2);res=1-res;\n';
    }
    if (phase === 'hold') {
      s += 'res=1;\n';
    }
    if (phase === 'karaoke') {
      // preview helper: one unit highlighted at a time, stepping every `step` seconds
      s += 'res=(Math.floor(Math.max(0,tin)/' + num(t.step || 0.4, 0.4) + ')%N)===I?1:0;\n';
    }
    if (phase === 'drift') {
      // slow linear drift across the whole life of the layer
      s += 'res=cl((time-inPoint)/Math.max(0.01,outPoint-inPoint));\n';
    }
    if (t.jitter) {
      // random on/off flashes (colour flicker, glitch offsets)
      s += 'var jk=Math.floor(time*' + num(t.jitter.rate || 6, 6) + ');res=res*(rnd(I*13+jk*29)<' + num(t.jitter.prob || 0.3, 0.3) + '?1:0);\n';
    }
    if (t.wiggle) {
      // smooth per-character noise in [-1,1], decaying from amount to settle
      var w = t.wiggle;
      var amt = Math.max(0.001, Number(w.amount) || 1);
      s += 'var wf=' + num(w.freq || 2, 2) + ',wp=rnd(I)*6.2832,wq=rnd(I+57)*6.2832;\n';
      s += 'var wn=(Math.sin(time*wf*2.1+wp)*0.6+Math.sin(time*wf*3.7+wq)*0.4);\n';
      s += 'var wd=' + num((Number(w.settle) || 0) / amt, 0) + '+(1-' + num((Number(w.settle) || 0) / amt, 0) + ')*(1-cl((time-inPoint)/' + num(w.decay || 2, 2) + '));\n';
      s += 'res=res*wn*wd;\n';
    }
    if (t.select) {
      s += 'if(I%' + Math.max(1, Math.round(t.select.mod)) + '!==' + Math.round(t.select.eq || 0) + ')res=0;\n';
    }
    if (t.sign === 'alt') s += 'res=res*(I%2===0?1:-1);\n';
    if (t.sign === 'rand') s += 'res=res*(rnd(I+' + Math.round(t.signSeed || 101) + ')*2-1);\n';
    if (t.sign === 'randSide') s += 'res=res*(rnd(I+' + Math.round(t.signSeed || 101) + ')<0.5?-1:1);\n';
    return s;
  }

  /** AE expression selector amount (percent, 3D). */
  function selectorExpression(timing, env) {
    return amountCore(timing, env) + 'var v=res*100;\n[v,v,v];';
  }

  /** Compile the same source for the preview. */
  var cache = {};
  function compileAmount(timing) {
    var key = JSON.stringify(timing || {});
    if (cache[key]) return cache[key];
    var body = amountCore(timing) + 'return res;';
    /* eslint-disable no-new-func */
    var fn = new Function('textIndex', 'textTotal', 'time', 'inPoint', 'outPoint', body);
    cache[key] = fn;
    return fn;
  }

  /**
   * Layer-level progress helper used by transform/effect expressions.
   * Exposes `pin` (0..1 eased in progress) and `pout` (0..1 eased out progress)
   * and `lt` (local time since in-point).
   */
  function layerCore(opts, env) {
    var o = opts || {};
    var ease = EASES[o.ease] ? o.ease : 'cubicOut';
    var outEase = EASES[o.outEase] ? o.outEase : ease;
    var s = 'var SEED=' + Math.round(Number(o.seed) || 3) + ';\n' + HELPERS;
    s += EASES[ease].replace('function ez(', 'function ezIn(') + '\n';
    s += EASES[outEase].replace('function ez(', 'function ezOut(') + '\n';
    s += timeSource(env, o.delay || 0).replace('var tin=', 'var lt=').replace(',tout=', ',lo=');
    s += 'var pin=ezIn(lt/' + num(o.dur || 0.6, 0.6) + ');\n';
    s += 'var pout=' + (o.out === false ? '1' : 'ezOut(lo/' + num(o.outDur || o.dur || 0.5, 0.5) + ')') + ';\n';
    return s;
  }

  function layerExpression(opts, valueCode, env) {
    return layerCore(opts, env) + valueCode;
  }

  /** Compile a layer-level expression for the preview: returns fn(time,inPoint,outPoint,value). */
  var lcache = {};
  function compileLayer(opts, valueCode) {
    var key = JSON.stringify(opts || {}) + '|' + valueCode;
    if (lcache[key]) return lcache[key];
    // valueCode must end in an expression statement; turn the last line into a return.
    var lines = valueCode.replace(/\s+$/, '').split('\n');
    var last = lines.pop().replace(/;\s*$/, '');
    var body = layerCore(opts) + lines.join('\n') + '\nreturn (' + last + ');';
    var fn = new Function('time', 'inPoint', 'outPoint', 'value', body);
    lcache[key] = fn;
    return fn;
  }

  var api = {
    EASES: EASES,
    ORDERS: ORDERS,
    amountCore: amountCore,
    selectorExpression: selectorExpression,
    compileAmount: compileAmount,
    layerCore: layerCore,
    layerExpression: layerExpression,
    compileLayer: compileLayer,
    timeSource: timeSource,
    num: num
  };

  root.CQ = root.CQ || {};
  root.CQ.expr = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);

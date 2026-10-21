/*
 * Caption logic: transcript normalisation, grouping, speech snapping, timing.
 *
 * Grouping
 *   'auto'  splits at sentence ends and pauses, then splits long phrases at
 *           the best places (commas, pauses, never after "the", "to" ...),
 *           keeping each caption within maxChars / maxDur. Deterministic.
 *   number  fixed number of words per caption (1..CUSTOM_MAX), never across
 *           a sentence end or a pause.
 */
(function (root) {
  'use strict';

  var CUSTOM_MAX = 20;
  var DEFAULTS = { maxChars: 42, maxDur: 4, gap: 0.5, minDur: 0.3 };

  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  /**
   * Normalise engine output into a flat, ordered, valid word list.
   * segments: [{start, end, text, words:[{word|text, start, end, score?}]}]
   * Words without timestamps are estimated inside their segment by length and
   * flagged `est: true`.
   */
  function normalize(segments) {
    var words = [];
    (segments || []).forEach(function (seg, si) {
      var ss = Number(seg.start), se = Number(seg.end);
      if (!isFinite(ss)) ss = words.length ? words[words.length - 1].end : 0;
      if (!isFinite(se) || se < ss) se = ss;
      var ws = (seg.words && seg.words.length) ? seg.words : null;
      if (!ws) {
        var toks = clean(seg.text).split(' ').filter(Boolean);
        var total = toks.reduce(function (a, t) { return a + t.length + 1; }, 0) || 1;
        var t = ss;
        ws = toks.map(function (tok) {
          var d = (se - ss) * (tok.length + 1) / total;
          var w = { word: tok, start: t, end: t + d, est: true };
          t += d; return w;
        });
      }
      ws.forEach(function (w) {
        var text = clean(w.word != null ? w.word : w.text);
        if (!text) return;
        var a = Number(w.start), b = Number(w.end), est = !!w.est;
        if (!isFinite(a) || !isFinite(b)) { a = NaN; b = NaN; est = true; }
        words.push({ text: text, start: a, end: b, score: w.score, est: est, seg: si });
      });
    });
    // fill missing times by interpolation between neighbours
    for (var i = 0; i < words.length; i++) {
      if (isFinite(words[i].start)) continue;
      var j = i; while (j < words.length && !isFinite(words[j].start)) j++;
      var prevEnd = i > 0 ? words[i - 1].end : 0;
      var nextStart = j < words.length ? words[j].start : prevEnd + (j - i) * 0.3;
      var step = Math.max(0.05, (nextStart - prevEnd) / (j - i));
      for (var k = i; k < j; k++) { words[k].start = prevEnd + step * (k - i); words[k].end = words[k].start + step; words[k].est = true; }
    }
    // sort, then remove overlaps and zero-length words
    words.sort(function (x, y) { return x.start - y.start; });
    for (i = 0; i < words.length; i++) {
      var w2 = words[i];
      if (w2.start < 0) w2.start = 0;
      if (i > 0 && w2.start < words[i - 1].end) {
        // overlapping: split the difference
        var mid = (w2.start + words[i - 1].end) / 2;
        words[i - 1].end = Math.max(words[i - 1].start + 0.02, mid);
        w2.start = words[i - 1].end;
      }
      if (w2.end < w2.start + 0.02) w2.end = w2.start + 0.02;
    }
    return words;
  }

  function endsSentence(t) { return /[.!?…。！？]["')\]]*$/.test(t); }
  function endsClause(t) { return /[,;:，、—–-]["')\]]*$/.test(t); }

  // words a caption should not end on ("... going to" / "the")
  var WEAK = {};
  ('a an the to of in on at for from with by as into onto about over under and or but nor so if than that which who whom whose ' +
   'this these those my your his her its our their i i\'m i\'ve i\'ll i\'d we you he she they it\'s is are was were be been am ' +
   'will would can could should shall may might must do does did not no very just really more most such how what where why when whether some any every each going gonna wanna want wants trying able need have has had got let').split(' ').forEach(function (w) { WEAK[w] = 1; });
  // good words to start a new caption with
  var STARTERS = {};
  'and but or so because which who that when where while if then although though since until after before how what why'.split(' ').forEach(function (w) { STARTERS[w] = 1; });
  // words that belong to the previous caption ("put | here", "bring | up")
  var NOSTART = {};
  'here there it them him me us up down out off away back too also yet % percent'.split(' ').forEach(function (w) { NOSTART[w] = 1; });
  function isWeak(t) { return !!WEAK[String(t).toLowerCase().replace(/[^a-z']/g, '')]; }

  function joinWords(ws) { return ws.map(function (w) { return w.text; }).join(' ').replace(/\s+([,.!?;:])/g, '$1'); }

  function makeGroup(ws) {
    return { text: joinWords(ws), start: ws[0].start, end: ws[ws.length - 1].end, words: ws.map(function (w) { return { text: w.text, start: w.start, end: w.end, est: w.est }; }), est: ws.some(function (w) { return w.est; }) };
  }

  /** Split into phrases at sentence ends and real pauses. */
  function phrases(words, gap) {
    var out = [], cur = [];
    words.forEach(function (w, i) {
      cur.push(w);
      var nx = words[i + 1];
      if (!nx || endsSentence(w.text) || nx.start - w.end > gap) { out.push(cur); cur = []; }
    });
    return out;
  }

  /**
   * Best split of one phrase (dynamic programming). Prefers full captions,
   * breaks at commas and pauses, and never ends a caption on a weak word
   * unless it has to.
   */
  function splitPhrase(ws, o) {
    var n = ws.length;
    var len = function (i, j) { return joinWords(ws.slice(i, j)).length; };
    if (len(0, n) <= o.maxChars && ws[n - 1].end - ws[0].start <= o.maxDur) return [ws];
    var total = len(0, n), target = total / Math.ceil(total / o.maxChars);
    var best = [0], from = [0];
    for (var j = 1; j <= n; j++) {
      best[j] = Infinity;
      for (var i = j - 1; i >= 0; i--) {
        var L = len(i, j);
        if (j - i > 1 && (L > o.maxChars || ws[j - 1].end - ws[i].start > o.maxDur * 1.25)) break;
        var dev = (L - target) / o.maxChars;
        var c = 1 + 2.5 * dev * dev;
        if (j < n) {
          var last = ws[j - 1];
          if (endsClause(last.text)) c -= 0.7;
          c -= Math.min(0.4, Math.max(0, ws[j].start - last.end)) * 2;
          if (isWeak(last.text)) c += 1.2;
          var nxt = String(ws[j].text).toLowerCase().replace(/[^a-z'%]/g, '');
          if (STARTERS[nxt]) c -= 0.45;
          if (NOSTART[nxt] || /^[%')\]]/.test(ws[j].text)) c += 0.7;
        }
        if (j - i === 1 && n > 1) c += 0.6;
        if (best[i] + c < best[j]) { best[j] = best[i] + c; from[j] = i; }
      }
    }
    var cuts = [], k = n;
    while (k > 0) { cuts.unshift(k); k = from[k]; }
    var out = [], a = 0;
    cuts.forEach(function (b) { out.push(ws.slice(a, b)); a = b; });
    return out;
  }

  /**
   * mode: 'auto' | number of words | 'custom' (uses opts.custom)
   * opts: maxChars (whole caption), maxDur, gap (pause that always splits)
   */
  function groupWords(words, mode, opts) {
    var o = {}; var k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    for (k in (opts || {})) if (opts[k] != null) o[k] = opts[k];
    var n = null;
    if (mode !== 'auto') {
      n = Math.round(Number(mode === 'custom' ? o.custom : mode));
      if (!isFinite(n) || n < 1 || n > CUSTOM_MAX) throw new Error('Words per caption must be between 1 and ' + CUSTOM_MAX + '.');
    }
    var groups = [];
    phrases(words, o.gap).forEach(function (ph) {
      if (n) { for (var i = 0; i < ph.length; i += n) groups.push(makeGroup(ph.slice(i, i + n))); return; }
      splitPhrase(ph, o).forEach(function (ws) { groups.push(makeGroup(ws)); });
    });
    return groups;
  }

  /* ---------------- speech activity (to snap captions to the voice) */

  /** samples: Int16Array (or Float32Array -1..1), rate in Hz. Returns [{start, end}] in seconds. */
  function speechRegions(samples, rate) {
    var hop = Math.round(rate * 0.01), win = Math.round(rate * 0.02);
    var scale = samples instanceof Int16Array ? 1 / 32768 : 1;
    var n = Math.max(0, Math.floor((samples.length - win) / hop) + 1);
    if (n < 10) return [];
    var db = new Float32Array(n), i, j;
    for (i = 0; i < n; i++) {
      var s = 0, a = i * hop;
      for (j = 0; j < win; j++) { var v = samples[a + j] * scale; s += v * v; }
      db[i] = 10 * Math.log(s / win + 1e-10) / Math.LN10;
    }
    var sorted = Array.prototype.slice.call(db).sort(function (x, y) { return x - y; });
    var floor = sorted[Math.floor(n * 0.1)], peak = sorted[Math.floor(n * 0.97)];
    var dur = samples.length / rate;
    if (peak - floor < 10) return [{ start: 0, end: dur }];   // no clear silence: don't snap
    var thr = floor + Math.max(6, (peak - floor) * 0.35);
    var regs = [], on = -1;
    for (i = 0; i <= n; i++) {
      var act = i < n && db[i] > thr;
      if (act && on < 0) on = i;
      if (!act && on >= 0) { regs.push([on, i]); on = -1; }
    }
    var merged = [];
    regs.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r[0] - last[1] < 15) last[1] = r[1]; else merged.push([r[0], r[1]]);
    });
    return merged.filter(function (r) { return r[1] - r[0] >= 5; }).map(function (r) {
      return { start: Math.max(0, r[0] * 0.01 - 0.02), end: Math.min(dur, r[1] * 0.01 + 0.04) };
    });
  }

  /**
   * Move word edges onto the real start/end of speech. A word that starts in
   * silence moves to where the voice starts; a word that ends in silence ends
   * where the voice stops. Times are in the same base as the regions.
   */
  function snapWords(words, regions) {
    if (!regions || !regions.length) return words;
    function regionAt(t) { for (var i = 0; i < regions.length; i++) if (t >= regions[i].start && t <= regions[i].end) return regions[i]; return null; }
    words.forEach(function (w, i) {
      var prevEnd = i ? words[i - 1].end : -1, nextStart = i < words.length - 1 ? words[i + 1].start : Infinity;
      var r = regionAt(w.start);
      if (!r) {
        for (var k = 0; k < regions.length; k++) if (regions[k].start > w.start) { if (regions[k].start < w.end - 0.04) w.start = regions[k].start; break; }
      } else if (r.start >= prevEnd && w.start - r.start < 0.35) w.start = r.start;
      var e = regionAt(w.end);
      if (!e) {
        for (var q = regions.length - 1; q >= 0; q--) if (regions[q].end < w.end) { if (regions[q].end > w.start + 0.04) w.end = regions[q].end; break; }
      } else if (e.end <= nextStart && e.end - w.end < 0.35) w.end = e.end;
      if (w.end < w.start + 0.04) w.end = w.start + 0.04;
    });
    return words;
  }

  /**
   * Caption times in composition time:
   *  - starts where the first word starts, ends where the last word ends
   *    plus a short tail, so captions follow the voice and clear in pauses
   *  - frame accurate, ordered, no overlaps
   *  - gaps shorter than closeGap are closed so captions don't flicker
   */
  function fitTiming(groups, opts) {
    var o = opts || {};
    var fps = o.fps || 30, frame = 1 / fps;
    var offset = o.offset || 0, stretch = (o.stretch || 100) / 100;
    var lo = o.compStart != null ? o.compStart : 0, hi = o.compEnd != null ? o.compEnd : Infinity;
    var minDur = Math.max(o.minDur || DEFAULTS.minDur, frame * 2);
    var closeGap = o.closeGap == null ? 0.2 : o.closeGap;
    var tail = o.tail == null ? 0.1 : o.tail;
    var out = [];
    groups.forEach(function (g) {
      var s = offset + g.start * stretch, e = offset + g.end * stretch;
      if (e <= lo || s >= hi) return;
      s = Math.max(lo, s); e = Math.min(hi, e);
      var words = (g.words || []).map(function (w) { return { text: w.text, start: Math.max(s, offset + w.start * stretch), end: Math.min(hi, offset + w.end * stretch), est: w.est }; });
      out.push({ text: g.text, start: s, end: e, words: words, est: g.est });
    });
    out.sort(function (a, b) { return a.start - b.start; });
    var eps = 1e-6;
    for (var i = 0; i < out.length; i++) {
      var c = out[i], nx = out[i + 1];
      c.start = Math.floor(c.start / frame + eps) * frame;
      var limit = nx ? nx.start : hi;
      var e2 = Math.max(c.end + tail, c.start + minDur);
      if (nx && limit - e2 <= closeGap) e2 = limit;     // tiny gap: hold until the next one
      c.end = Math.min(Math.ceil(e2 / frame - eps) * frame, nx ? Math.floor(limit / frame + eps) * frame : hi);
      if (c.end <= c.start) c.end = c.start + frame;
      if (nx && c.end > nx.start) nx.start = c.end;
      if (c.end > hi) c.end = hi;
    }
    return out.filter(function (c) { return c.end > c.start && clean(c.text); });
  }

  /** Re-split edited caption text into words, keeping timings proportionally. */
  function retime(caption) {
    var toks = clean(caption.text).split(' ').filter(Boolean);
    var s = caption.start, e = caption.end;
    if (!toks.length) return [];
    var old = caption.words || [];
    if (old.length === toks.length) return toks.map(function (t, i) { return { text: t, start: old[i].start, end: old[i].end, est: old[i].est }; });
    var total = toks.reduce(function (a, t) { return a + t.length + 1; }, 0);
    var t0 = s;
    return toks.map(function (t) { var d = (e - s) * (t.length + 1) / total; var w = { text: t, start: t0, end: t0 + d, est: true }; t0 += d; return w; });
  }

  /** Wrap into lines of at most maxChars; with maxLines 2 the lines are balanced. */
  function wrapLines(text, maxChars, maxLines) {
    var words = clean(text).split(' ');
    if (!maxChars || maxChars < 4) return clean(text);
    if (maxLines === 1) return clean(text);
    var full = words.join(' ');
    if (full.length <= maxChars) return full;
    if (maxLines === 2) {
      var best = null, bestCost = Infinity;
      for (var i = 1; i < words.length; i++) {
        var a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        var cost = Math.max(a.length, b.length) + (a.length < b.length ? 0.5 : 0) + (isWeak(words[i - 1]) ? 4 : 0);
        if (cost < bestCost) { bestCost = cost; best = a + '\r' + b; }
      }
      if (best) return best;
    }
    var lines = [], cur = '';
    words.forEach(function (w) {
      if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; }
      else cur = cur ? cur + ' ' + w : w;
    });
    if (cur) lines.push(cur);
    return lines.join('\r');
  }

  function fmtTime(t, fps) {
    if (!isFinite(t)) return '--:--';
    var neg = t < 0; t = Math.abs(t);
    var m = Math.floor(t / 60), s = t - m * 60;
    var whole = Math.floor(s), frac = s - whole;
    var ff = fps ? Math.round(frac * fps) : Math.round(frac * 100);
    if (fps && ff >= fps) { ff = 0; whole += 1; }
    return (neg ? '-' : '') + (m < 10 ? '0' : '') + m + ':' + (whole < 10 ? '0' : '') + whole + (fps ? ':' : '.') + (ff < 10 ? '0' : '') + ff;
  }

  /** Parse "mm:ss.cc", "mm:ss:ff", "ss.cc" or plain seconds. */
  function parseTime(str, fps) {
    var s = String(str).trim();
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    var m = /^(\d+):(\d{1,2})(?:([.:])(\d{1,3}))?$/.exec(s);
    if (!m) return NaN;
    var v = Number(m[1]) * 60 + Number(m[2]);
    if (m[4] != null) v += m[3] === ':' ? Number(m[4]) / (fps || 30) : Number('0.' + m[4]);
    return v;
  }

  var api = { normalize: normalize, groupWords: groupWords, speechRegions: speechRegions, snapWords: snapWords, isWeak: isWeak, fitTiming: fitTiming, retime: retime, wrapLines: wrapLines, fmtTime: fmtTime, parseTime: parseTime, CUSTOM_MAX: CUSTOM_MAX, DEFAULTS: DEFAULTS, joinWords: joinWords };
  root.CQ = root.CQ || {};
  root.CQ.captions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);

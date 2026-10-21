/*
 * Caption logic: transcript normalisation, grouping and timing.
 *
 * Grouping modes
 *   'auto'  deterministic: a caption ends at sentence punctuation, at a pause
 *           longer than `gap` seconds, or before it would exceed `maxChars`
 *           characters or `maxDur` seconds. Commas end a caption once it is
 *           at least 60% of maxChars. No randomness, no hidden model.
 *   1,2,4,5 fixed number of words per caption.
 *   'custom' fixed number of words, 1..CUSTOM_MAX.
 */
(function (root) {
  'use strict';

  var CUSTOM_MAX = 20;
  var DEFAULTS = { maxChars: 32, maxDur: 3.2, gap: 0.6, minDur: 0.25 };

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
  function endsClause(t) { return /[,;:，、]["')\]]*$/.test(t); }

  function joinWords(ws) { return ws.map(function (w) { return w.text; }).join(' ').replace(/\s+([,.!?;:])/g, '$1'); }

  function makeGroup(ws) {
    return { text: joinWords(ws), start: ws[0].start, end: ws[ws.length - 1].end, words: ws.map(function (w) { return { text: w.text, start: w.start, end: w.end, est: w.est }; }), est: ws.some(function (w) { return w.est; }) };
  }

  function groupWords(words, mode, opts) {
    var o = {}; var k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    for (k in (opts || {})) if (opts[k] != null) o[k] = opts[k];
    var groups = [], cur = [];
    var n = null;
    if (mode !== 'auto') {
      n = Math.round(Number(mode === 'custom' ? o.custom : mode));
      if (!isFinite(n) || n < 1 || n > CUSTOM_MAX) throw new Error('Words per caption must be between 1 and ' + CUSTOM_MAX + '.');
    }
    function flush() { if (cur.length) { groups.push(makeGroup(cur)); cur = []; } }
    words.forEach(function (w, i) {
      if (n) {
        cur.push(w);
        if (cur.length >= n) flush();
        return;
      }
      if (cur.length) {
        var prev = cur[cur.length - 1];
        var chars = joinWords(cur.concat([w])).length;
        var dur = w.end - cur[0].start;
        if (w.start - prev.end > o.gap || chars > o.maxChars || dur > o.maxDur) flush();
      }
      cur.push(w);
      var len = joinWords(cur).length;
      if (endsSentence(w.text)) flush();
      else if (endsClause(w.text) && len >= o.maxChars * 0.6) flush();
    });
    flush();
    return groups;
  }

  /**
   * Make caption times valid for After Effects:
   *  - offset into composition time, clamp to [compStart, compEnd]
   *  - ordered, non-overlapping, at least minDur (or 2 frames) long
   *  - optional extension of short gaps so captions don't flash
   */
  function fitTiming(groups, opts) {
    var o = opts || {};
    var fps = o.fps || 30, frame = 1 / fps;
    var offset = o.offset || 0, stretch = (o.stretch || 100) / 100;
    var lo = o.compStart != null ? o.compStart : 0, hi = o.compEnd != null ? o.compEnd : Infinity;
    var minDur = Math.max(o.minDur || DEFAULTS.minDur, frame * 2);
    var closeGap = o.closeGap == null ? 0.25 : o.closeGap;
    var out = [];
    groups.forEach(function (g) {
      var s = offset + g.start * stretch, e = offset + g.end * stretch;
      if (e <= lo || s >= hi) return; // outside the visible range
      s = Math.max(lo, s); e = Math.min(hi, e);
      s = Math.round(s / frame) * frame; e = Math.round(e / frame) * frame;
      var words = (g.words || []).map(function (w) { return { text: w.text, start: Math.max(s, offset + w.start * stretch), end: Math.min(hi, offset + w.end * stretch), est: w.est }; });
      out.push({ text: g.text, start: s, end: e, words: words, est: g.est });
    });
    out.sort(function (a, b) { return a.start - b.start; });
    for (var i = 0; i < out.length; i++) {
      var c = out[i], nx = out[i + 1];
      if (c.end - c.start < minDur) c.end = c.start + minDur;
      if (nx) {
        if (nx.start - c.end > 0 && nx.start - c.end <= closeGap) c.end = nx.start;
        if (c.end > nx.start) {
          c.end = Math.max(c.start + frame, nx.start);
          if (c.end > nx.start) nx.start = c.end;
        }
      }
      if (c.end > hi) c.end = hi;
      if (c.end <= c.start) c.end = Math.min(hi, c.start + frame);
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

  function wrapLines(text, maxChars) {
    if (!maxChars || maxChars < 4) return text;
    var words = clean(text).split(' '), lines = [], cur = '';
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

  var api = { normalize: normalize, groupWords: groupWords, fitTiming: fitTiming, retime: retime, wrapLines: wrapLines, fmtTime: fmtTime, parseTime: parseTime, CUSTOM_MAX: CUSTOM_MAX, DEFAULTS: DEFAULTS, joinWords: joinWords };
  root.CQ = root.CQ || {};
  root.CQ.captions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);

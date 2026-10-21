/*
 * Mock After Effects host for running the panel in a plain browser
 * (development, automated UI tests and Help screenshots). Never used inside
 * After Effects.
 */
(function (root) {
  'use strict';
  var CQ = root.CQ = root.CQ || {};
  var q = {};
  try { (root.location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); }); } catch (e) {}

  var comp = { id: 7, name: 'Main Edit', width: 1920, height: 1080, duration: 30, frameRate: 30, time: 0 };
  var layers = {
    video: { index: 3, name: 'interview_take2.mp4', kind: 'video-audio', inPoint: 0, outPoint: 24.5, startTime: 0, stretch: 100, fileExists: true },
    text: { index: 1, name: 'TITLE', kind: 'text', inPoint: 0, outPoint: 6, text: 'TITLE' },
    text2: { index: 2, name: 'SUBTITLE', kind: 'text', inPoint: 0, outPoint: 6, text: 'SUBTITLE' },
    shape: { index: 4, name: 'Shape Layer 1', kind: 'shape', inPoint: 0, outPoint: 30 }
  };
  function selected() {
    var s = q.sel == null ? 'video' : q.sel;
    if (!s) return [];
    return s.split(',').map(function (k) { return layers[k]; }).filter(Boolean);
  }
  var delay = function (ms, v) { return new Promise(function (r) { setTimeout(function () { r(v); }, ms); }); };

  var plugins = { deepglow: q.plugins === 'all', sapphire: q.plugins === 'all', bcc: q.plugins === 'all' };

  var H = {
    ping: function () { return { ok: true, version: '1.0.0', ae: '25.1', os: 'Windows' }; },
    getSelection: function () { return { ok: true, comp: q.nocomp ? null : comp, layers: q.nocomp ? [] : selected(), aeVersion: '25.1' }; },
    checkPlugins: function () { return { ok: true, found: plugins, effectCount: 300 }; },
    listFonts: function () { return { ok: true, supported: false, fonts: [] }; },
    getAudioPlan: function () {
      var s = selected().filter(function (l) { return /audio|precomp/.test(l.kind); });
      if (!s.length) return { ok: false, code: 'NO_SELECTION', message: 'Select a layer' };
      return { ok: true, layer: s[0], comp: comp, mode: 'file', pieces: [{ file: 'C:/media/interview_take2.mp4', at: 0, from: 0, to: 24.5, stretch: 100 }], range: { start: 0, end: 24.5 }, warnings: [] };
    },
    applyPreset: function (p) {
      var t = selected().filter(function (l) { return l.kind === 'text'; });
      if (!t.length) return { ok: false, code: 'NO_TEXT_LAYERS', message: 'Select text layers', skipped: [] };
      return { ok: true, results: t.map(function (l) { return { name: l.name, ok: true, warnings: [] }; }), skipped: [] };
    },
    removePreset: function () { return { ok: true, cleared: selected().filter(function (l) { return l.kind === 'text'; }).length }; },
    createCaptions: function (p) { return { ok: true, created: p.captions.length, layers: [], warnings: [] }; }
  };

  var SAMPLE = 'So today I want to show you how I edit my videos. First we pick the clip, then we cut the pauses, and finally we add the captions. It only takes a few minutes, and the result looks clean.';

  CQ.mockHost = {
    call: function (fn, payload) {
      if (!H[fn]) return Promise.resolve({ ok: false, code: 'NO_FN', message: fn });
      return delay(60, H[fn](payload));
    },
    verifyApi: function (dir) {
      var groups = {};
      ['ffmpeg', 'whispercpp', 'model-ggml-small', 'python', 'whisperx', 'model-faster-whisper-small', 'model-align-en', 'data'].forEach(function (g, i) { groups[g] = { ok: q.api !== 'bad' || i < 3, files: [1, 6, 1, 4120, 2, 4, 1, 9][i] }; });
      var ok = q.api !== 'bad';
      return delay(900, { ok: ok, dir: dir, version: '1.0.0', missing: ok ? [] : ['python/python.exe'], wrongSize: [], badHash: [], groups: groups, engines: { whispercpp: true, whisperx: ok, align: ok }, problems: ok ? [] : ['PARTIAL'] });
    },
    transcriptionJob: function (o) {
      var cancelled = false;
      return {
        cancel: function () { cancelled = true; },
        start: function () {
          var stages = [['extracting', 'Preparing audio', 8], ['loading', 'Loading model', 6], ['transcribing', 'Transcribing', 30], ['aligning', 'Aligning words', 10]];
          var i = 0, k = 0;
          return new Promise(function (resolve, reject) {
            function tick() {
              if (cancelled) { var e = new Error('Cancelled'); e.code = 'CANCELLED'; return reject(e); }
              var st = stages[i];
              if (!st) {
                var t = 0.4, words = SAMPLE.split(' ').map(function (w) { var d = 0.18 + w.length * 0.035; var x = { text: w, start: t, end: t + d }; t += d + (/[.,]$/.test(w) ? 0.35 : 0.06); return x; });
                o.onProgress({ state: 'done', pct: 1, label: 'Done' });
                return resolve({ words: words, language: 'en', engine: o.engine, wordTiming: o.engine === 'whisperx' ? 'aligned' : 'whisper', seconds: 12.4 });
              }
              o.onProgress({ state: st[0], pct: st[0] === 'loading' ? null : k / st[2], label: st[1] });
              k++;
              if (k > st[2]) { k = 0; i++; }
              setTimeout(tick, q.fast ? 5 : 90);
            }
            tick();
          });
        }
      };
    }
  };
})(typeof window !== 'undefined' ? window : global);

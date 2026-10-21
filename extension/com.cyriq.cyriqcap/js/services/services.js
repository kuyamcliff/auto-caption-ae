/*
 * CyriqCap services (run in the CEP panel's Node.js context).
 *
 * Written for the oldest supported runtime (CEP 9 / Node 8 in After Effects
 * 2019): no optional chaining, no fs.promises, no Array.prototype.flat.
 *
 * Nothing here talks to the network. Child processes are started with an
 * argument array (never a shell string), so paths and transcript text can't
 * inject commands.
 */
(function (root) {
  'use strict';
  var CQ = root.CQ = root.CQ || {};

  var req = null;
  try { req = root.cep_node ? root.cep_node.require : (typeof require === 'function' ? require : null); } catch (e) { req = null; }
  var hasNode = !!req;
  var fs = hasNode ? req('fs') : null;
  var path = hasNode ? req('path') : null;
  var os = hasNode ? req('os') : null;
  var cp = hasNode ? req('child_process') : null;
  var crypto = hasNode ? req('crypto') : null;
  var isWin = hasNode ? process.platform === 'win32' : true;

  var MANIFEST = 'cyriqcap-api.json';

  /* ---------------------------------------------------------------- */
  /* small utils                                                        */
  /* ---------------------------------------------------------------- */
  function exists(p) { try { fs.accessSync(p); return true; } catch (e) { return false; } }
  function stat(p) { try { return fs.statSync(p); } catch (e) { return null; } }
  function mkdirp(p) {
    if (exists(p)) return;
    mkdirp(path.dirname(p));
    try { fs.mkdirSync(p); } catch (e) { if (!exists(p)) throw e; }
  }
  function rmrf(p) {
    if (!exists(p)) return;
    var st = fs.lstatSync(p);
    if (st.isDirectory()) { fs.readdirSync(p).forEach(function (f) { rmrf(path.join(p, f)); }); fs.rmdirSync(p); }
    else fs.unlinkSync(p);
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function appDataDir() {
    if (!hasNode) return '';
    var base = isWin ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')) : path.join(os.homedir(), '.config');
    return path.join(base, 'CyriqCap');
  }

  /* ---------------------------------------------------------------- */
  /* logging (no transcript text, no full media paths)                  */
  /* ---------------------------------------------------------------- */
  var Log = {
    dir: function () { return path.join(appDataDir(), 'logs'); },
    file: function () { var d = new Date(); return path.join(Log.dir(), 'cyriqcap-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '.log'); },
    write: function (level, job, msg) {
      if (!hasNode) { if (root.console) console.log('[' + level + ']', job || '-', msg); return; }
      try { mkdirp(Log.dir()); fs.appendFileSync(Log.file(), new Date().toISOString() + ' ' + level + ' ' + (job || '-') + ' ' + String(msg).replace(/[\r\n]+/g, ' ') + '\n'); } catch (e) {}
    },
    info: function (job, m) { Log.write('INFO', job, m); },
    warn: function (job, m) { Log.write('WARN', job, m); },
    error: function (job, m) { Log.write('ERROR', job, m); },
    redact: function (p) { return p ? ('…' + String(p).slice(-24)) : p; }
  };

  /* ---------------------------------------------------------------- */
  /* errors with a step + recovery hint                                */
  /* ---------------------------------------------------------------- */
  function CQError(code, step, message, hint, detail) {
    var e = new Error(message);
    e.code = code; e.step = step; e.hint = hint || ''; e.detail = detail || '';
    return e;
  }

  /* ---------------------------------------------------------------- */
  /* process runner with cancellation + timeout                        */
  /* ---------------------------------------------------------------- */
  function run(cmd, args, opts) {
    var o = opts || {};
    return new Promise(function (resolve, reject) {
      if (!exists(cmd)) return reject(CQError('BIN_MISSING', o.step || 'run', 'Program not found: ' + path.basename(cmd), 'Re-check the API folder in Settings.'));
      var child;
      try {
        child = cp.spawn(cmd, args, { cwd: o.cwd || path.dirname(cmd), env: o.env || process.env, windowsHide: true, shell: false });
      } catch (e) {
        return reject(CQError('SPAWN_FAILED', o.step || 'run', 'Could not start ' + path.basename(cmd), 'Your antivirus may be blocking it, or the file is damaged. Re-check the API folder.', e.message));
      }
      var out = '', err = '', done = false, timer = null;
      function finish(fn, v) { if (done) return; done = true; if (timer) clearTimeout(timer); if (o.signal) o.signal.off(); fn(v); }
      if (o.timeout) timer = setTimeout(function () { kill(child); finish(reject, CQError('TIMEOUT', o.step || 'run', path.basename(cmd) + ' took too long and was stopped.', 'Try a shorter clip or the faster engine.')); }, o.timeout);
      if (o.signal) o.signal.on(function () { kill(child); finish(reject, CQError('CANCELLED', o.step || 'run', 'Cancelled')); });
      child.stdout.on('data', function (d) { var s = d.toString(); out += s; if (out.length > 4e6) out = out.slice(-2e6); if (o.onStdout) o.onStdout(s); });
      child.stderr.on('data', function (d) { var s = d.toString(); err += s; if (err.length > 2e5) err = err.slice(-1e5); if (o.onStderr) o.onStderr(s); });
      child.on('error', function (e) { finish(reject, CQError('SPAWN_FAILED', o.step || 'run', 'Could not start ' + path.basename(cmd), 'Re-check the API folder.', e.message)); });
      child.on('close', function (code) {
        if (code === 0) finish(resolve, { out: out, err: err });
        else finish(reject, CQError('EXIT_' + code, o.step || 'run', path.basename(cmd) + ' failed (exit code ' + code + ').', '', err.slice(-1500)));
      });
    });
  }

  function kill(child) {
    try {
      if (isWin) cp.spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false });
      else child.kill('SIGKILL');
    } catch (e) {}
  }

  function Signal() { this._fns = []; this.aborted = false; }
  Signal.prototype.on = function (fn) { if (this.aborted) fn(); else this._fns.push(fn); };
  Signal.prototype.off = function () { this._fns = []; };
  Signal.prototype.abort = function () { if (this.aborted) return; this.aborted = true; var f = this._fns; this._fns = []; f.forEach(function (x) { try { x(); } catch (e) {} }); };

  /* ---------------------------------------------------------------- */
  /* API folder                                                        */
  /* ---------------------------------------------------------------- */
  var Api = {
    MANIFEST: MANIFEST,
    paths: function (dir) {
      var exe = isWin ? '.exe' : '';
      return {
        dir: dir,
        manifest: path.join(dir, MANIFEST),
        ffmpeg: path.join(dir, 'bin', 'ffmpeg' + exe),
        whisperCli: path.join(dir, 'whisper.cpp', 'whisper-cli' + exe),
        ggmlSmall: path.join(dir, 'models', 'ggml-small.bin'),
        python: isWin ? path.join(dir, 'python', 'python.exe') : path.join(dir, 'python', 'bin', 'python3'),
        wxScript: path.join(dir, 'whisperx', 'run_whisperx.py'),
        wxModel: path.join(dir, 'models', 'faster-whisper-small'),
        torchHome: path.join(dir, 'models', 'torch'),
        nltk: path.join(dir, 'models', 'nltk_data'),
        hf: path.join(dir, 'models', 'hf')
      };
    },

    readManifest: function (dir) {
      var p = path.join(dir, MANIFEST);
      if (!exists(p)) return null;
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return { _error: e.message }; }
    },

    /**
     * Check every file listed in the manifest.
     * opts.deep: also verify SHA-256 (reports progress by bytes).
     */
    verify: function (dir, opts) {
      var o = opts || {};
      return new Promise(function (resolve) {
        var res = { ok: false, dir: dir, version: null, missing: [], wrongSize: [], badHash: [], groups: {}, engines: { whispercpp: false, whisperx: false }, problems: [] };
        if (!dir || !exists(dir)) { res.problems.push('FOLDER_NOT_FOUND'); return resolve(res); }
        var m = Api.readManifest(dir);
        if (!m) { res.problems.push('NOT_API_FOLDER'); return resolve(res); }
        if (m._error) { res.problems.push('MANIFEST_DAMAGED'); return resolve(res); }
        res.version = m.version;
        var files = m.files || [];
        var groups = {};
        var totalBytes = files.reduce(function (a, f) { return a + (f.size || 0); }, 0), doneBytes = 0;
        var i = 0;
        function mark(g, ok) { if (!groups[g]) groups[g] = { ok: true, files: 0 }; groups[g].files++; if (!ok) { groups[g].ok = false; if (o.onFail) o.onFail(files[i - 1].path, g); } }
        function nextFile() {
          if (i >= files.length) return finish();
          var f = files[i++];
          if (o.onFile) o.onFile(i, files.length, f.path, f.group);
          var full = path.join(dir, f.path.split('/').join(path.sep));
          var st = stat(full);
          if (!st) { res.missing.push(f.path); mark(f.group, false); doneBytes += f.size || 0; return later(); }
          if (f.size != null && st.size !== f.size) { res.wrongSize.push(f.path); mark(f.group, false); doneBytes += f.size || 0; return later(); }
          if (!o.deep || !f.sha256) { mark(f.group, true); doneBytes += f.size || 0; return later(); }
          var h = crypto.createHash('sha256');
          var s = fs.createReadStream(full, { highWaterMark: 4 * 1024 * 1024 });
          s.on('data', function (b) { h.update(b); doneBytes += b.length; if (o.onProgress) o.onProgress(doneBytes / Math.max(1, totalBytes), f.path); });
          s.on('error', function () { res.badHash.push(f.path); mark(f.group, false); later(); });
          s.on('end', function () { var ok = h.digest('hex') === f.sha256; if (!ok) res.badHash.push(f.path); mark(f.group, ok); later(); });
        }
        var tick = 0;
        function later() {
          if (o.onProgress) o.onProgress(doneBytes / Math.max(1, totalBytes), null);
          // yield to the UI every few files so the list stays live
          if (++tick % 24 === 0) setTimeout(nextFile, 0); else nextFile();
        }
        function finish() {
          res.groups = groups;
          function g(n) { return groups[n] ? groups[n].ok : false; }
          res.engines.whispercpp = g('ffmpeg') && g('whispercpp') && g('model-ggml-small');
          res.engines.whisperx = g('ffmpeg') && g('python') && g('whisperx') && g('model-faster-whisper-small');
          res.engines.align = g('model-align-en');
          res.ok = res.missing.length === 0 && res.wrongSize.length === 0 && res.badHash.length === 0;
          if (!res.ok && (res.engines.whispercpp || res.engines.whisperx)) res.problems.push('PARTIAL');
          resolve(res);
        }
        nextFile();
      });
    }
  };

  /* ---------------------------------------------------------------- */
  /* temp files                                                        */
  /* ---------------------------------------------------------------- */
  var Temp = {
    root: function () { return path.join(os.tmpdir(), 'CyriqCap'); },
    job: function (id) { var d = path.join(Temp.root(), 'job-' + id); mkdirp(d); return d; },
    clean: function (dir) { try { if (dir && dir.indexOf(Temp.root()) === 0) rmrf(dir); } catch (e) { Log.warn(null, 'temp cleanup failed: ' + e.message); } },
    sweep: function () {
      // remove leftovers older than a day (crash, closed panel)
      try {
        var r = Temp.root(); if (!exists(r)) return;
        fs.readdirSync(r).forEach(function (f) { var p = path.join(r, f), st = stat(p); if (st && Date.now() - st.mtime.getTime() > 864e5) Temp.clean(p); });
      } catch (e) {}
    },
    freeBytes: function () { return null; }
  };

  /* ---------------------------------------------------------------- */
  /* audio extraction                                                  */
  /* ---------------------------------------------------------------- */
  function parseFfTime(s) { var m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null; }

  function atempoChain(rate) {
    // ffmpeg atempo accepts 0.5..2.0 per instance
    var parts = [];
    while (rate > 2) { parts.push('atempo=2'); rate /= 2; }
    while (rate < 0.5) { parts.push('atempo=0.5'); rate /= 0.5; }
    parts.push('atempo=' + rate.toFixed(5));
    return parts.join(',');
  }

  /** plan from host CQ.getAudioPlan. Writes a 16 kHz mono WAV of the layer's audible range. */
  function extractAudio(plan, out, ff, opts) {
    var o = opts || {};
    var range = plan.range, total = Math.max(0.1, range.end - range.start);
    var args = ['-hide_banner', '-nostdin', '-y'];
    var filters = [];
    plan.pieces.forEach(function (pc, i) {
      var dur = Math.max(0.05, (pc.to - pc.from));
      args.push('-ss', Math.max(0, pc.from).toFixed(3), '-t', dur.toFixed(3), '-i', pc.file);
      var chain = '[' + i + ':a:0]aresample=16000,aformat=channel_layouts=mono';
      if (pc.stretch && Math.abs(pc.stretch - 100) > 0.01) chain += ',' + atempoChain(100 / pc.stretch);
      var delay = Math.max(0, Math.round((pc.at - range.start) * 1000));
      if (delay > 0) chain += ',adelay=' + delay;
      filters.push(chain + '[a' + i + ']');
    });
    var n = plan.pieces.length;
    var fc = filters.join(';') + ';' + (n > 1 ? plan.pieces.map(function (p, i) { return '[a' + i + ']'; }).join('') + 'amix=inputs=' + n + ':duration=longest:dropout_transition=0[mix]' : '[a0]anull[mix]');
    args.push('-filter_complex', fc, '-map', '[mix]', '-t', total.toFixed(3), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out);
    return run(ff, args, {
      step: 'extract', signal: o.signal, timeout: Math.max(120000, total * 4000),
      onStderr: function (s) { var t = parseFfTime(s); if (t != null && o.onProgress) o.onProgress(Math.min(1, t / total)); }
    }).then(function () {
      var st = stat(out);
      if (!st || st.size < 2000) throw CQError('NO_AUDIO', 'extract', 'No audio was found in the selected layer.', 'Check that the layer has an audio track and that it is not muted.');
      return { file: out, duration: total };
    }, function (e) {
      if (e.code === 'CANCELLED') throw e;
      var d = String(e.detail || '');
      if (/matches no streams|does not contain any stream|Stream specifier/.test(d)) throw CQError('NO_AUDIO', 'extract', 'The selected media has no audio track.', 'Select a layer that contains sound.', d);
      if (/Invalid data found|could not find codec|Decoder .* not found|Unknown/i.test(d)) throw CQError('UNSUPPORTED_CODEC', 'extract', 'This media format could not be decoded.', 'Convert the file to WAV, MP3, MOV or MP4 (H.264/AAC) and try again.', d);
      if (/No such file|does not exist/i.test(d)) throw CQError('FILE_MISSING', 'extract', 'The media file could not be found.', 'Relink the footage in After Effects.', d);
      if (/No space left/i.test(d)) throw CQError('DISK_FULL', 'extract', 'Not enough disk space for the temporary audio file.', 'Free some space on your system drive.', d);
      e.step = 'extract'; throw e;
    });
  }

  /* ---------------------------------------------------------------- */
  /* transcription engines                                             */
  /* ---------------------------------------------------------------- */
  function parseStamp(s) { var m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s || ''); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : NaN; }

  function threads() { var n = hasNode ? os.cpus().length : 4; return Math.max(1, Math.min(8, n - 1)); }

  var Engines = {
    /**
     * whisper.cpp with full JSON output: sentence segments + per-token times.
     * Tokens are merged into words (a token starting with a space starts a word).
     */
    whispercpp: function (wav, P, opts) {
      var o = opts || {};
      var base = wav.replace(/\.wav$/i, '') + '-wc';
      var args = ['-m', o.ggml, '-f', wav, '-t', String(threads()), '-l', o.language || 'auto', '-ojf', '-of', base, '-pp', '-np'];
      if (o.onStage) o.onStage('loading', null);
      return run(P.whisperCli, args, {
        step: 'transcribe', signal: o.signal, timeout: Math.max(600000, (o.duration || 60) * 15000), cwd: path.dirname(P.whisperCli),
        onStderr: function (s) {
          var m = /progress\s*=\s*(\d+)%/.exec(s);
          if (m && o.onStage) o.onStage('transcribing', Number(m[1]) / 100);
        }
      }).then(function () {
        var jf = base + '.json';
        if (!exists(jf)) throw CQError('NO_RESULT', 'transcribe');
        var raw;
        try { raw = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) { throw CQError('BAD_RESULT', 'transcribe', '', '', e.message); }
        var segments = (raw.transcription || []).map(function (seg) {
          var words = [], cur = null;
          (seg.tokens || []).forEach(function (tk) {
            var tx = String(tk.text || '');
            if (!tx || /^\[_/.test(tx) || /^\[.*\]$/.test(tx.trim())) return;
            var a = tk.offsets ? tk.offsets.from / 1000 : parseStamp(tk.timestamps && tk.timestamps.from);
            var b = tk.offsets ? tk.offsets.to / 1000 : parseStamp(tk.timestamps && tk.timestamps.to);
            if (!cur || /^\s/.test(tx)) { cur = { word: tx.trim(), start: a, end: b }; words.push(cur); }
            else { cur.word += tx; cur.end = b; }
          });
          words = words.filter(function (w) { return w.word; });
          return { start: seg.offsets ? seg.offsets.from / 1000 : 0, end: seg.offsets ? seg.offsets.to / 1000 : 0, text: String(seg.text || '').trim(), words: words };
        }).filter(function (s) { return s.text && !/^\[.*\]$/.test(s.text); });
        return { language: raw.result ? raw.result.language : (o.language || 'en'), segments: segments, wordTiming: 'whisper' };
      }, function (e) {
        if (e.code === 'CANCELLED') throw e;
        var d = String(e.detail || '');
        if (/failed to (load|read|open) model|invalid model|bad magic/i.test(d)) throw CQError('MODEL_CORRUPT', 'transcribe', '', '', d);
        if (/not enough memory|bad_alloc|out of memory/i.test(d)) throw CQError('NO_MEMORY', 'transcribe', '', '', d);
        if (/3221225781|0xC0000135|dll/i.test(e.code + ' ' + d)) throw CQError('DLL_MISSING', 'transcribe', '', '', d);
        e.step = 'transcribe'; throw e;
      });
    },

    /** Python runner: full transcription (+ alignment) or alignment only. */
    python: function (wav, P, opts) {
      var o = opts || {};
      var outJson = wav.replace(/\.wav$/i, o.segments ? '.align.json' : '.wx.json');
      var env = {};
      for (var k in process.env) env[k] = process.env[k];
      env.HF_HUB_OFFLINE = '1'; env.TRANSFORMERS_OFFLINE = '1'; env.HF_DATASETS_OFFLINE = '1';
      env.HF_HOME = P.hf; env.TORCH_HOME = P.torchHome; env.NLTK_DATA = P.nltk;
      env.PYTHONIOENCODING = 'utf-8'; env.PYTHONUTF8 = '1'; env.PYTHONNOUSERSITE = '1';
      env.OMP_NUM_THREADS = String(threads());
      delete env.PYTHONPATH; delete env.PYTHONHOME;
      var args = ['-I', P.wxScript, '--audio', wav, '--out', outJson, '--threads', String(threads()), '--language', o.language || 'auto'];
      if (o.segments) {
        var segFile = wav.replace(/\.wav$/i, '.segments.json');
        fs.writeFileSync(segFile, JSON.stringify(o.segments));
        args.push('--segments', segFile);
      } else args.push('--model', o.ct2);
      var buf = '';
      return run(P.python, args, {
        step: o.segments ? 'align' : 'transcribe', signal: o.signal, env: env, cwd: path.dirname(P.wxScript), timeout: Math.max(900000, (o.duration || 60) * 25000),
        onStdout: function (s) {
          buf += s;
          var lines = buf.split(/\r?\n/); buf = lines.pop();
          lines.forEach(function (l) {
            if (l.indexOf('@@') !== 0) return;
            try { var ev = JSON.parse(l.slice(2)); if (o.onStage) o.onStage(ev.stage, ev.pct == null ? null : ev.pct); } catch (e) {}
          });
        }
      }).then(function () {
        if (!exists(outJson)) throw CQError('NO_RESULT', 'python');
        var r = JSON.parse(fs.readFileSync(outJson, 'utf8'));
        if (r.error) throw CQError(r.code || 'PYTHON', r.step || 'python', '', '', r.error);
        return { language: r.language, segments: r.segments || [], wordTiming: r.aligned ? 'aligned' : 'whisper' };
      }, function (e) {
        if (e.code === 'CANCELLED') throw e;
        try { if (exists(outJson)) { var r = JSON.parse(fs.readFileSync(outJson, 'utf8')); if (r.error) throw CQError(r.code || 'PYTHON', r.step || 'python', '', '', r.error); } } catch (x) { if (x.code) throw x; }
        e.step = 'python'; throw e;
      });
    }
  };

  /* ---------------------------------------------------------------- */
  /* models (installed + downloads)                                    */
  /* ---------------------------------------------------------------- */
  var Models = {
    ggmlPath: function (dir, id) { return path.join(dir, 'models', 'ggml-' + id + '.bin'); },
    ct2Dir: function (dir, id) { return path.join(dir, 'models', 'faster-whisper-' + id); },
    status: function (dir) {
      return CQ.models.list.map(function (m) {
        var g = stat(Models.ggmlPath(dir, m.id));
        var c = Models.ct2Dir(dir, m.id);
        var ctOk = exists(path.join(c, 'model.bin')) && exists(path.join(c, 'config.json')) && exists(path.join(c, 'tokenizer.json'));
        var ggOk = !!(g && (!m.ggml.size || g.size === m.ggml.size));
        return { id: m.id, name: m.name, tag: m.tag, ggml: ggOk, ct2: ctOk, installed: ggOk || ctOk, size: CQ.models.downloadSize(m) };
      });
    },
    pythonOk: function (P) { return exists(P.python) && exists(P.wxScript); },
    alignOk: function (P) { return exists(path.join(P.dir, 'models', 'align')) && fs.readdirSync(path.join(P.dir, 'models', 'align')).some(function (f) { return /\.pth$/.test(f); }); },

    /** Download one file with resume, redirects, size + SHA-256 check. */
    fetch: function (url, dest, expect, onBytes, signal) {
      var https = req('https'), http = req('http'), URL = req('url');
      var part = dest + '.part';
      mkdirp(path.dirname(dest));
      return new Promise(function (resolve, reject) {
        var have = stat(part) ? stat(part).size : 0;
        var aborted = false, reqObj = null;
        if (signal) signal.on(function () { aborted = true; try { if (reqObj) reqObj.abort(); } catch (e) {} reject(CQError('CANCELLED', 'download')); });
        function get(u, hops) {
          if (hops > 8) return reject(CQError('DOWNLOAD', 'download', '', '', 'too many redirects'));
          var opt = URL.parse(u);
          opt.headers = { 'User-Agent': 'CyriqCap/1.0' };
          if (have > 0) opt.headers.Range = 'bytes=' + have + '-';
          var lib = opt.protocol === 'http:' ? http : https;
          reqObj = lib.get(opt, function (res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return get(URL.resolve(u, res.headers.location), hops + 1); }
            if (res.statusCode === 416) { res.resume(); return finish(); } // already complete
            if (res.statusCode !== 200 && res.statusCode !== 206) { res.resume(); return reject(CQError('DOWNLOAD', 'download', '', '', 'HTTP ' + res.statusCode)); }
            if (res.statusCode === 200) have = 0; // server ignored the range: start over
            var out = fs.createWriteStream(part, { flags: have > 0 ? 'a' : 'w' });
            res.on('data', function (b) { if (onBytes) onBytes(b.length); });
            res.pipe(out);
            out.on('finish', function () { if (!aborted) finish(); });
            out.on('error', function (e) { reject(CQError(/ENOSPC/.test(e.code) ? 'DISK_FULL' : 'DOWNLOAD', 'download', '', '', e.message)); });
            res.on('error', function (e) { reject(CQError('DOWNLOAD', 'download', '', '', e.message)); });
          });
          reqObj.on('error', function (e) { if (!aborted) reject(CQError('OFFLINE', 'download', '', '', e.message)); });
          reqObj.setTimeout(60000, function () { reqObj.abort(); });
        }
        function finish() {
          var st = stat(part);
          if (expect.size && (!st || st.size !== expect.size)) { try { fs.unlinkSync(part); } catch (e) {} return reject(CQError('DOWNLOAD_BAD', 'download', '', '', 'size')); }
          if (!expect.sha256) { fs.renameSync(part, dest); return resolve(dest); }
          var h = crypto.createHash('sha256');
          fs.createReadStream(part).on('data', function (b) { h.update(b); }).on('end', function () {
            if (h.digest('hex') !== expect.sha256) { try { fs.unlinkSync(part); } catch (e) {} return reject(CQError('DOWNLOAD_BAD', 'download', '', '', 'sha256')); }
            try { if (exists(dest)) fs.unlinkSync(dest); fs.renameSync(part, dest); } catch (e) { return reject(CQError('DOWNLOAD', 'download', '', '', e.message)); }
            resolve(dest);
          }).on('error', function (e) { reject(CQError('DOWNLOAD', 'download', '', '', e.message)); });
        }
        get(url, 0);
      });
    },

    /** Download every missing file of a model into the API folder. */
    download: function (dir, id, onProgress, signal) {
      var m = CQ.models.byId(id);
      if (!m) return Promise.reject(CQError('UNKNOWN_MODEL', 'download'));
      var jobs = [];
      if (m.ggml && !exists(Models.ggmlPath(dir, id))) jobs.push({ url: m.ggml.url, dest: Models.ggmlPath(dir, id), size: m.ggml.size, sha256: m.ggml.sha256 });
      (m.ct2 || []).forEach(function (f) { var d = path.join(Models.ct2Dir(dir, id), f.name); if (!exists(d)) jobs.push({ url: f.url, dest: d, size: f.size, sha256: f.sha256 }); });
      var total = jobs.reduce(function (a, j) { return a + (j.size || 3000); }, 0), done = 0;
      Log.info(null, 'download model ' + id + ' files=' + jobs.length + ' bytes=' + total);
      return jobs.reduce(function (pr, j) {
        return pr.then(function () {
          return Models.fetch(j.url, j.dest, j, function (n) { done += n; if (onProgress) onProgress(Math.min(1, done / total), done, total); }, signal);
        });
      }, Promise.resolve()).then(function () { Log.info(null, 'download model ' + id + ' ok'); return true; }, function (e) { Log.error(null, 'download ' + id + ' ' + e.code + ' ' + (e.detail || '')); throw e; });
    },

    remove: function (dir, id) {
      var m = CQ.models.byId(id);
      if (!m || m.bundled) return false;
      try { if (exists(Models.ggmlPath(dir, id))) fs.unlinkSync(Models.ggmlPath(dir, id)); rmrf(Models.ct2Dir(dir, id)); } catch (e) { return false; }
      return true;
    }
  };

  /* ---------------------------------------------------------------- */
  /* fonts                                                             */
  /* ---------------------------------------------------------------- */
  var Fonts = {
    userDir: function () { return isWin ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts') : path.join(os.homedir(), '.local', 'share', 'fonts'); },
    sysDir: function () { return isWin ? path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts') : '/usr/share/fonts'; },
    bundled: function (extDir) {
      var d = path.join(extDir, 'fonts');
      return fs.readdirSync(d).filter(function (f) { return /\.(ttf|otf)$/i.test(f) && !/^Inter-/.test(f); }).map(function (f) { return { file: f, src: path.join(d, f) }; });
    },
    status: function (extDir) {
      return Fonts.bundled(extDir).map(function (f) {
        return { file: f.file, installed: exists(path.join(Fonts.userDir(), f.file)) || exists(path.join(Fonts.sysDir(), f.file)) };
      });
    },
    /** Per-user install (no administrator rights needed on Windows 10 1809+). */
    install: function (extDir, onProgress) {
      var list = Fonts.bundled(extDir), dst = Fonts.userDir(), done = 0, errors = [];
      try { mkdirp(dst); } catch (e) { return Promise.reject(CQError('FONT_DIR', 'fonts', 'Could not open your fonts folder.', '', e.message)); }
      function regName(f) { return f.file.replace(/\.(ttf|otf)$/i, '').replace(/-/g, ' ') + ' (TrueType)'; }
      return list.reduce(function (pr, f) {
        return pr.then(function () {
          var target = path.join(dst, f.file);
          try { if (!exists(target)) fs.writeFileSync(target, fs.readFileSync(f.src)); } catch (e) { errors.push(f.file); return; }
          if (!isWin) return;
          return run(path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'reg.exe'),
            ['add', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', '/v', regName(f), '/t', 'REG_SZ', '/d', target, '/f'],
            { step: 'fonts', timeout: 15000 }).catch(function () { errors.push(f.file); });
        }).then(function () { done++; if (onProgress) onProgress(done / list.length, f.file); });
      }, Promise.resolve()).then(function () { return { installed: list.length - errors.length, failed: errors }; });
    }
  };

  /* ---------------------------------------------------------------- */
  /* transcription job: one pipeline, no engine choice                */
  /* ---------------------------------------------------------------- */
  /*
   * 1. Prepare audio (ffmpeg).
   * 2. If the model is available in CTranslate2 form and the Python runtime
   *    works: transcribe + align words in one pass.
   * 3. Otherwise transcribe with whisper.cpp, then refine the word timing
   *    with the alignment model (if available).
   * Each step falls back to the next one instead of failing.
   */
  function TranscriptionJob(opts) {
    this.id = uid();
    this.opts = opts;
    this.signal = new Signal();
    this.state = 'idle';
    this.tmp = null;
    this.notes = [];
  }
  TranscriptionJob.prototype.cancel = function () { if (this.state !== 'done' && this.state !== 'error') { this.signal.abort(); this.state = 'cancelling'; } };
  TranscriptionJob.prototype.start = function () {
    var self = this, o = this.opts, P = Api.paths(o.apiDir);
    var LABEL = { extracting: 'Preparing audio', loading: 'Loading model', vad: 'Loading model', transcribing: 'Transcribing', aligning: 'Timing words', writing: 'Finishing', done: 'Done' };
    var set = function (state, pct) { self.state = state; if (o.onProgress) o.onProgress({ state: state === 'vad' ? 'loading' : state === 'writing' ? 'aligning' : state, pct: pct, label: LABEL[state] || 'Working' }); };
    var modelId = o.model || CQ.models.DEFAULT;
    var ggml = Models.ggmlPath(o.apiDir, modelId), ct2 = Models.ct2Dir(o.apiDir, modelId);
    var haveGgml = exists(ggml), haveCt2 = exists(path.join(ct2, 'model.bin'));
    var py = Models.pythonOk(P), align = py && Models.alignOk(P);
    if (!haveGgml && !haveCt2) return Promise.reject(CQError('MODEL_MISSING', 'prepare'));
    Log.info(self.id, 'start model=' + modelId + ' ggml=' + haveGgml + ' ct2=' + haveCt2 + ' py=' + py + ' align=' + align + ' lang=' + (o.language || 'auto') + ' pieces=' + o.plan.pieces.length + ' len=' + (o.plan.range.end - o.plan.range.start).toFixed(2) + 's');
    var t0 = Date.now();
    try { self.tmp = Temp.job(self.id); } catch (e) { return Promise.reject(CQError('TEMP', 'prepare', '', '', e.message)); }
    var wav = path.join(self.tmp, 'audio.wav'), duration = 0;
    var stage = function (st, pct) { set(st, pct); };
    set('extracting', 0);

    function viaWhisperCpp() {
      if (!haveGgml) throw CQError('MODEL_MISSING', 'transcribe');
      return Engines.whispercpp(wav, P, { ggml: ggml, language: o.language, duration: duration, signal: self.signal, onStage: stage }).then(function (r) {
        if (!align || !r.segments.length) return r;
        set('aligning', null);
        return Engines.python(wav, P, { segments: r.segments.map(function (s) { return { start: s.start, end: s.end, text: s.text }; }), language: r.language, duration: duration, signal: self.signal, onStage: function (st, pct) { set('aligning', st === 'aligning' ? pct : null); } })
          .then(function (a) { return a.wordTiming === 'aligned' && a.segments.length ? { language: r.language, segments: a.segments, wordTiming: 'aligned' } : r; },
            function (e) { if (e.code === 'CANCELLED') throw e; Log.warn(self.id, 'alignment skipped: ' + e.code + ' ' + String(e.detail || '').slice(-300)); return r; });
      });
    }

    return extractAudio(o.plan, wav, P.ffmpeg, { signal: self.signal, onProgress: function (p) { set('extracting', p); } })
      .then(function (a) {
        duration = a.duration;
        Log.info(self.id, 'audio ' + a.duration.toFixed(2) + 's in ' + (Date.now() - t0) + 'ms');
        set('loading', null);
        if (haveCt2 && py) {
          return Engines.python(wav, P, { ct2: ct2, language: o.language, duration: duration, signal: self.signal, onStage: stage })
            .catch(function (e) {
              if (e.code === 'CANCELLED' || self.signal.aborted) throw e;
              Log.warn(self.id, 'python pipeline failed (' + e.code + '): ' + String(e.detail || '').slice(-400) + ' -> whisper.cpp');
              if (!haveGgml) throw e;
              set('loading', null);
              align = false; // the runtime that failed is also the aligner
              return viaWhisperCpp();
            });
        }
        return viaWhisperCpp();
      })
      .then(function (r) {
        var words = CQ.captions.normalize(r.segments);
        if (!words.length) throw CQError('EMPTY', 'transcribe');
        Log.info(self.id, 'done words=' + words.length + ' timing=' + r.wordTiming + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
        set('done', 1);
        return { words: words, language: r.language, wordTiming: r.wordTiming, seconds: (Date.now() - t0) / 1000, model: modelId };
      })
      .then(function (r) { Temp.clean(self.tmp); return r; }, function (e) {
        Temp.clean(self.tmp);
        if (e.code === 'CANCELLED' || self.signal.aborted) { Log.info(self.id, 'cancelled'); set('cancelled', null); throw CQError('CANCELLED', e.step || 'transcribe'); }
        Log.error(self.id, (e.code || 'ERR') + ' step=' + (e.step || '?') + (e.detail ? ' :: ' + String(e.detail).slice(-500) : ''));
        set('error', null);
        throw e;
      });
  };

  /*
   * Friendly text for every error code. Raw details only go to the log.
   */
  var MESSAGES = {
    MODEL_MISSING: ['Model not installed', 'Download the selected model, or pick another one.'],
    NO_AUDIO: ['No sound found', 'The selected layer has no audio track, or its audio is switched off.'],
    UNSUPPORTED_CODEC: ['Media format not supported', 'Convert the file to MP4, MOV, WAV or MP3 and try again.'],
    FILE_MISSING: ['Media file missing', 'Relink the footage in After Effects, then try again.'],
    DISK_FULL: ['Not enough disk space', 'Free some space on your system drive and try again.'],
    NO_MEMORY: ['Not enough memory', 'Close other applications or choose a smaller model.'],
    MODEL_CORRUPT: ['Model file damaged', 'Open Settings and run a full check, or download the model again.'],
    DLL_MISSING: ['Windows component missing', 'Install the Microsoft Visual C++ Redistributable (x64), then try again.'],
    EMPTY: ['No speech detected', 'Check the audio level and the language.'],
    TIMEOUT: ['This took too long', 'Try a shorter clip or a smaller model.'],
    TEMP: ['Could not prepare temporary files', 'Check free disk space and try again.'],
    OFFLINE: ['No internet connection', 'Connect to the internet to download models.'],
    DOWNLOAD: ['Download interrupted', 'Click Download again to resume.'],
    DOWNLOAD_BAD: ['Download was damaged', 'Click Download again. The damaged file was removed.'],
    BIN_MISSING: ['CyriqCap API folder incomplete', 'Open Settings to see which files are missing.'],
    SPAWN_FAILED: ['Could not start transcription', 'Your antivirus may be blocking the API folder. Allow it and try again.']
  };
  function friendly(e) {
    var m = MESSAGES[e && e.code] || ['Something went wrong', 'Try again. If it keeps happening, open Settings › Logs.'];
    return { title: m[0], text: m[1] };
  }

  CQ.services = { hasNode: hasNode, isWin: isWin, Log: Log, Api: Api, Temp: Temp, Fonts: Fonts, Engines: Engines, Models: Models, friendly: friendly, TranscriptionJob: TranscriptionJob, extractAudio: extractAudio, run: run, Signal: Signal, CQError: CQError, appDataDir: appDataDir, exists: exists, mkdirp: mkdirp };
  if (typeof module !== 'undefined' && module.exports) module.exports = CQ.services;
})(typeof window !== 'undefined' ? window : global);

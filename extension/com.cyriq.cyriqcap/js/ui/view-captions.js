/* Auto Caption tab. */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui, el = U.el, C = CQ.captions;

  var DEFAULT_STYLE = {
    font: 'Montserrat-Bold', size: 80, fill: '#ffffff', strokeOn: true, stroke: '#000000', strokeWidth: 6, tracking: 0,
    caps: false, pos: 'bc', offX: 0, offY: 0, maxChars: 32, boxOn: false, box: '#000000', boxOpacity: 65, boxPadX: 26, boxPadY: 14, boxRound: 12,
    shadowOn: true, hlOn: false, hl: '#ffd400', hlMode: 'current', anim: 'none', speed: 1
  };

  var S = {
    plan: null, job: null, running: false, words: null, captions: [], dirty: false, wordTiming: null, language: null,
    grouping: U.store.get('grouping', 'auto'), custom: U.store.get('customWords', 3),
    engine: U.store.get('engine', 'whisperx'), lang: U.store.get('lang', 'auto'),
    style: (function () { var s = U.store.get('style', {}), o = {}, k; for (k in DEFAULT_STYLE) o[k] = s[k] != null ? s[k] : DEFAULT_STYLE[k]; return o; })()
  };

  var V = {};       // element refs
  var player = null;

  function saveStyle() { U.store.set('style', S.style); refreshPreview(); }

  /* ---------------------------------------------------------- source card */
  function kindLabel(k) { return { 'video-audio': 'Video + audio', audio: 'Audio', precomp: 'Precomp', video: 'Video (no audio)', text: 'Text', shape: 'Shape', solid: 'Solid' }[k] || k; }

  function renderSource(sel) {
    var card = V.source;
    card.innerHTML = '';
    var layers = (sel && sel.layers) || [];
    var usable = layers.filter(function (l) { return l.kind === 'audio' || l.kind === 'video-audio' || l.kind === 'precomp'; });
    var cls = 'card source', ico = 'film', t, s;
    if (!sel || !sel.comp) { cls += ' empty'; ico = 'alert'; t = 'No composition open'; s = 'Open a composition'; }
    else if (!layers.length) { cls += ' empty'; ico = 'layers'; t = 'Select a layer in the timeline'; s = 'Audio · Video · Precomp'; }
    else if (!usable.length) { cls += ' bad'; ico = 'alert'; t = layers[0].name; s = kindLabel(layers[0].kind) + ' · no audio'; }
    else if (usable.length > 1) { cls += ' bad'; ico = 'alert'; t = usable.length + ' sources selected'; s = 'Select one source layer'; }
    else {
      var l = usable[0];
      ico = l.kind === 'audio' ? 'wave' : l.kind === 'precomp' ? 'layers' : 'film';
      t = l.name; s = C.fmtTime(l.inPoint) + ' – ' + C.fmtTime(l.outPoint) + ' · ' + sel.comp.name;
      if (l.fileExists === false) { cls += ' bad'; s = 'Media file missing'; }
    }
    card.className = cls;
    card.appendChild(el('div', { class: 'ico', html: CQ.icons[ico] }));
    var meta = el('div', { class: 'meta' }, [el('div', { class: 't' }, [t, usable.length === 1 ? el('span', { class: 'kind', text: kindLabel(usable[0].kind) }) : null]), el('div', { class: 's', text: s })]);
    card.appendChild(meta);
    V.gen.disabled = S.running || !(usable.length === 1 && usable[0].fileExists !== false);
  }

  /* ---------------------------------------------------------- progress */
  var STEPS = [['extracting', 'Audio'], ['loading', 'Model'], ['transcribing', 'Transcribe'], ['aligning', 'Align'], ['done', 'Done']];
  function showProgress(p) {
    V.prog.classList.remove('hidden');
    V.progStage.textContent = p.label || '';
    var indet = p.pct == null;
    V.bar.classList.toggle('indet', indet);
    V.barFill.style.width = indet ? '' : Math.round((p.pct || 0) * 100) + '%';
    V.pct.textContent = indet ? '' : Math.round((p.pct || 0) * 100) + '%';
    var idx = STEPS.map(function (x) { return x[0]; }).indexOf(p.state);
    if (p.state === 'writing') idx = 3;
    U.$$('span', V.steps).forEach(function (sp, i) {
      sp.className = i < idx ? 'done' : i === idx ? 'on' : '';
      if (S.engine === 'whispercpp' && i === 3) sp.style.display = 'none'; else sp.style.display = '';
    });
  }

  /* ---------------------------------------------------------- generate */
  function apiReady() {
    var a = CQ.app.api;
    if (!a || !(a.engines.whispercpp || a.engines.whisperx)) {
      U.modal({ kind: 'warn', title: 'API folder needed', text: 'Choose your CyriqCap API folder to transcribe.', actions: [{ label: 'Close' }, { label: 'Open Settings', primary: true, onClick: function () { CQ.app.go('settings'); } }] });
      return false;
    }
    if (!a.engines[S.engine]) {
      var other = S.engine === 'whisperx' ? 'whispercpp' : 'whisperx';
      if (a.engines[other]) { S.engine = other; V.engine.value = other; U.toast('warn', 'Engine switched', (other === 'whisperx' ? 'WhisperX' : 'Whisper.cpp') + ' is used because the other engine is incomplete in the API folder.'); }
    }
    return true;
  }

  var HOST_ERRORS = {
    NO_COMP: ['No composition', 'Open a composition and select a layer.'],
    NO_SELECTION: ['Nothing selected', 'Select an audio, video or precomp layer in the timeline.'],
    UNSUPPORTED_LAYER: ['Layer has no audio', 'Select an audio layer, a video with sound, or a precomp that contains audio.'],
    MULTIPLE_SOURCES: ['Several sources selected', 'Select exactly one source layer so audio is never mixed by accident.'],
    NO_AUDIO: ['No audio found', 'The precomp has no audible layers. Check that audio is switched on.'],
    FILE_MISSING: ['Media file missing', 'Relink the footage in After Effects, then try again.'],
    NO_FILE: ['No media file', 'This layer does not come from a file.']
  };

  function generate() {
    if (S.running) return;
    if (!apiReady()) return;
    var go = function () {
      CQ.host.call('getAudioPlan', {}).then(function (r) {
        if (!r.ok) {
          var m = HOST_ERRORS[r.code] || ['Cannot read the selection', r.message];
          U.modal({ kind: 'warn', title: m[0], text: m[1] });
          return;
        }
        if (r.warnings && r.warnings.length) U.toast('warn', 'Note', r.warnings[0]);
        startJob(r);
      }, function (e) { U.modal({ kind: 'err', title: 'After Effects did not respond', text: e.message }); });
    };
    if (S.dirty && S.captions.length) {
      U.modal({ kind: 'warn', title: 'Replace edited transcript?', text: 'Your edits will be lost.', actions: [{ label: 'Keep edits' }, { label: 'Replace', primary: true, onClick: go }] });
    } else go();
  }

  function startJob(plan) {
    S.plan = plan;
    S.running = true;
    V.gen.classList.add('hidden');
    V.cancel.disabled = false;
    showProgress({ state: 'extracting', pct: 0, label: 'Preparing audio' });
    CQ.app.busy(true);
    var job;
    if (CQ.services.hasNode && CQ.host.inAE || (CQ.services.hasNode && !root.CQ.mockHost)) {
      job = new CQ.services.TranscriptionJob({ apiDir: CQ.app.apiDir, engine: S.engine, language: S.lang, plan: plan, onProgress: showProgress });
    } else {
      job = CQ.mockHost.transcriptionJob({ engine: S.engine, language: S.lang, plan: plan, onProgress: showProgress });
    }
    S.job = job;
    job.start().then(function (r) {
      S.words = r.words; S.language = r.language; S.wordTiming = r.wordTiming; S.dirty = false;
      regroup();
      U.toast('ok', 'Transcript ready', r.words.length + ' words · ' + r.seconds.toFixed(1) + ' s');
    }, function (e) {
      if (e.code === 'CANCELLED') { U.toast('info', 'Cancelled', 'No changes were made.'); return; }
      U.modal({ kind: 'err', title: 'Transcription failed', text: (e.step ? 'Step: ' + stepName(e.step) + '. ' : '') + e.message, list: e.hint ? [e.hint] : null, detail: e.detail ? String(e.detail).slice(-600) : null });
    }).then(function () {
      S.running = false; S.job = null;
      V.prog.classList.add('hidden'); V.gen.classList.remove('hidden');
      CQ.app.busy(false);
      renderSource(CQ.app.selection);
    });
  }
  function stepName(s) { return { extract: 'Preparing audio', transcribe: 'Transcription', loading: 'Loading model', prepare: 'Preparation', transcribing: 'Transcription' }[s] || s; }

  function cancel() { if (S.job) { V.cancel.disabled = true; V.progStage.textContent = 'Cancelling'; S.job.cancel(); } }

  /* ---------------------------------------------------------- transcript */
  function groupingValue() { return S.grouping === 'custom' ? 'custom' : S.grouping; }

  function regroup() {
    if (!S.words) return;
    var groups;
    try { groups = C.groupWords(S.words, groupingValue(), { custom: S.custom, maxChars: S.style.maxChars }); }
    catch (e) { U.toast('warn', 'Grouping', e.message); return; }
    var r = S.plan.range;
    S.captions = C.fitTiming(groups, { offset: r.start, compStart: r.start, compEnd: r.end, fps: S.plan.comp.frameRate });
    S.dirty = false;
    renderTranscript();
    refreshPreview();
  }

  function timingBadge() {
    if (S.wordTiming === 'aligned') return el('span', { class: 'badge ok', text: 'Aligned' });
    if (S.wordTiming === 'whisper') return el('span', { class: 'badge info', text: 'Whisper timing' });
    return el('span', { class: 'badge warn', text: 'Estimated' });
  }

  function renderTranscript() {
    var card = V.trCard;
    card.classList.toggle('hidden', !S.words);
    if (!S.words) return;
    V.trCount.textContent = S.captions.length + ' captions';
    V.trBadge.innerHTML = ''; V.trBadge.appendChild(timingBadge());
    U.$$('.chip', V.groupChips).forEach(function (c) { c.classList.toggle('active', String(c.dataset.g) === String(S.grouping)); });
    var list = V.trList;
    list.innerHTML = '';
    var fps = S.plan.comp.frameRate;
    S.captions.forEach(function (c, i) {
      var tIn = el('input', { class: 'input', value: C.fmtTime(c.start, fps), title: 'In' });
      var tOut = el('input', { class: 'input', value: C.fmtTime(c.end, fps), title: 'Out' });
      var ta = el('textarea', { class: 'input', rows: 1 });
      ta.value = c.text;
      var words = el('div', { class: 'words' });
      function paintWords() { words.textContent = c.words.map(function (w) { return w.text; }).length + ' words' + (c.est ? ' · estimated timing' : ''); }
      paintWords();
      function fit() { ta.style.height = 'auto'; ta.style.height = Math.max(32, ta.scrollHeight + 2) + 'px'; }
      ta.addEventListener('input', function () { c.text = ta.value; c.words = C.retime(c); S.dirty = true; paintWords(); fit(); if (i === 0) refreshPreview(); });
      ta.addEventListener('focus', function () { row.classList.add('focus'); });
      ta.addEventListener('blur', function () { row.classList.remove('focus'); });
      function onTime(inp, key) {
        inp.addEventListener('change', function () {
          var v = C.parseTime(inp.value, fps);
          var ok = isFinite(v) && v >= S.plan.range.start - 1e-6 && v <= S.plan.range.end + 1e-6;
          if (ok) { c[key] = v; ok = c.end > c.start; }
          inp.classList.toggle('bad', !ok);
          if (ok) { inp.value = C.fmtTime(v, fps); c.words = C.retime(c); S.dirty = true; }
        });
      }
      onTime(tIn, 'start'); onTime(tOut, 'end');
      var row = el('div', { class: 'tr-row' }, [
        el('div', { class: 'times' }, [tIn, tOut]), ta,
        el('button', { class: 'del', title: 'Delete', html: CQ.icons.trash, onclick: function () { S.captions.splice(i, 1); S.dirty = true; renderTranscript(); } }),
        words
      ]);
      row.style.animationDelay = Math.min(i, 12) * 0.02 + 's';
      list.appendChild(row);
      setTimeout(fit, 0);
    });
    V.create.disabled = !S.captions.length;
  }

  function setGrouping(g) {
    var apply = function () { S.grouping = g; U.store.set('grouping', g); regroup(); };
    if (S.dirty) U.modal({ kind: 'warn', title: 'Regroup captions?', text: 'Text edits will be replaced by the original transcript.', actions: [{ label: 'Cancel' }, { label: 'Regroup', primary: true, onClick: apply }] });
    else apply();
  }

  /* ---------------------------------------------------------- create layers */
  var POS = { tl: [0.15, 0.14], tc: [0.5, 0.14], tr: [0.85, 0.14], ml: [0.15, 0.5], mc: [0.5, 0.5], mr: [0.85, 0.5], bl: [0.15, 0.82], bc: [0.5, 0.82], br: [0.85, 0.82] };

  function validateRows() {
    var bad = 0;
    U.$$('.tr-row .times input', V.trList).forEach(function (i) { if (i.classList.contains('bad')) bad++; });
    S.captions.forEach(function (c) { if (!(c.end > c.start) || !String(c.text).trim()) bad++; });
    return bad;
  }

  function createLayers() {
    if (!S.captions.length) return;
    var bad = validateRows();
    if (bad) { U.modal({ kind: 'warn', title: 'Fix highlighted rows', text: bad + ' caption(s) have empty text or invalid times.' }); return; }
    CQ.host.call('getSelection').then(function (sel) {
      if (!sel.comp) { U.modal({ kind: 'warn', title: 'No composition', text: 'Open the composition you transcribed.' }); return; }
      var go = function () { doCreate(sel.comp); };
      if (S.plan && sel.comp.id !== S.plan.layer.compId && S.plan.compId && sel.comp.id !== S.plan.compId) {
        U.modal({ kind: 'warn', title: 'Different composition', text: 'The active composition is not the one you transcribed. Create the captions here anyway?', actions: [{ label: 'Cancel' }, { label: 'Create here', primary: true, onClick: go }] });
      } else go();
    });
  }

  function doCreate(comp) {
    var st = S.style, k = comp.height / 1080;
    var pos = POS[st.pos] || POS.bc;
    var justify = st.pos[1] === 'l' ? 'left' : st.pos[1] === 'r' ? 'right' : 'center';
    var preset = st.anim !== 'none' ? CQ.presets.byId(st.anim) : null;
    var payload = {
      captions: S.captions.map(function (c) {
        var text = C.wrapLines(st.caps ? c.text.toUpperCase() : c.text, st.maxChars);
        var o = { text: text, start: c.start, end: c.end };
        if (st.hlOn && c.words && c.words.length) o.highlightExpr = CQ.builder.highlightExpr(c.words, st.hlMode);
        return o;
      }),
      style: { font: st.font, size: st.size * k, fill: st.fill, stroke: st.strokeOn ? { color: st.stroke, width: st.strokeWidth * k } : null, tracking: st.tracking, justify: justify },
      position: [comp.width * pos[0] + st.offX * k, comp.height * pos[1] + st.offY * k],
      box: st.boxOn ? { color: st.box, opacity: st.boxOpacity, padX: st.boxPadX * k, padY: st.boxPadY * k, round: st.boxRound * k } : null,
      shadow: st.shadowOn ? { fx: 'shadow', color: '#000000', opacity: 70, distance: 4, softness: 10 } : null,
      highlight: st.hlOn ? { color: st.hl } : null,
      preset: preset ? CQ.builder.build(preset, { useFont: false, useColors: false, speed: st.speed }) : null,
      aboveLayerIndex: S.plan ? S.plan.layer.index : null,
      prefix: 'Caption'
    };
    if (preset && (preset.needs || []).length) {
      var miss = preset.needs.filter(function (n) { return !CQ.app.plugins[n]; });
      if (miss.length) { CQ.animate.pluginModal(preset, miss); return; }
    }
    V.create.classList.add('loading');
    CQ.host.call('createCaptions', payload).then(function (r) {
      V.create.classList.remove('loading');
      if (!r.ok) { U.modal({ kind: 'err', title: 'Could not create captions', text: r.message, list: r.hint ? [r.hint] : null }); return; }
      var fontMissing = (r.warnings || []).filter(function (w) { return w.indexOf('FONT_MISSING') === 0; });
      U.toast('ok', r.created + ' caption layers created', 'Ctrl+Z undoes them in one step.');
      if (fontMissing.length) CQ.app.fontMissing(fontMissing.map(function (w) { return w.split(':')[1]; }));
    }, function (e) { V.create.classList.remove('loading'); U.modal({ kind: 'err', title: 'After Effects did not respond', text: e.message }); });
  }

  /* ---------------------------------------------------------- style + preview */
  function captionPreset() {
    var st = S.style;
    var base = st.anim !== 'none' ? CQ.presets.byId(st.anim) : null;
    var p = base ? JSON.parse(JSON.stringify(base)) : { id: 'static', name: 'Static', font: st.font, anims: [{ based: 'chars', props: { opacity: 0 }, t: { phase: 'both', dur: 0.15, overlap: 1 } }], fx: [] };
    p.font = st.font;
    var text = (S.captions[0] && S.captions[0].text) || 'Your captions look like this';
    p.sample = C.wrapLines(text, st.maxChars).replace(/\r/g, '\n');
    p.style = { size: st.size, fill: st.fill, tracking: st.tracking, caps: st.caps, stroke: st.strokeOn ? { color: st.stroke, width: st.strokeWidth } : null, leading: 1.15 };
    p.anims = (p.anims || []).filter(function (a) { return !(a.props && a.props.fill) && !a.wordColors; });
    if (st.hlOn) p.anims.push({ based: 'words', props: { fill: st.hl }, t: { phase: 'karaoke', step: 0.35 } });
    p.extras = (p.extras || []).slice();
    if (st.boxOn) p.extras.unshift({ type: 'captionBox', color: st.box, opacity: st.boxOpacity / 100, pad: [st.boxPadX, st.boxPadY], round: st.boxRound });
    p.bg = '#151a24';
    if (st.shadowOn) p.fx = (p.fx || []).concat([{ fx: 'shadow', color: '#000000', opacity: 70, distance: 4, softness: 10 }]);
    return p;
  }

  function refreshPreview() {
    if (!player) return;
    var pos = POS[S.style.pos] || POS.bc;
    player.setPreset(captionPreset());
    player.setOptions({ offsetX: (pos[0] - 0.5) * 1920 * 0.86 + S.style.offX, offsetY: (pos[1] - 0.5) * 1080 + S.style.offY, speed: S.style.speed, fitWidth: S.style.pos[1] === 'c' ? 0.86 : 0.55 });
  }

  function fontOptions() {
    var F = CQ.presets.FONTS, bundled = Object.keys(F).map(function (ps) { return { value: ps, label: F[ps].css }; });
    var groups = [{ group: 'CyriqCap fonts', items: bundled }];
    if (CQ.app.aeFonts && CQ.app.aeFonts.length) groups.push({ group: 'Installed in After Effects', items: CQ.app.aeFonts.map(function (f) { return { value: f.ps, label: f.family + ' ' + f.style }; }) });
    return groups;
  }

  function styleCard() {
    var st = S.style;
    function set(k) { return function (v) { st[k] = v; saveStyle(); }; }
    var canvas = el('canvas', { width: 640, height: 360 });
    player = new CQ.preview.Player(canvas, captionPreset(), { fps: 30 });
    U.watch(canvas, player);
    var posgrid = el('div', { class: 'posgrid' });
    Object.keys(POS).forEach(function (k) {
      var b = el('button', { class: k === st.pos ? 'active' : '', title: k });
      b.addEventListener('click', function () { U.$$('button', posgrid).forEach(function (x) { x.classList.remove('active'); }); b.classList.add('active'); st.pos = k; saveStyle(); });
      posgrid.appendChild(b);
    });
    V.fontSel = U.select(fontOptions(), st.font, set('font'));
    var anims = [{ value: 'none', label: 'None' }].concat(CQ.presets.CATEGORIES.slice(1).map(function (cat) {
      return { group: cat, items: CQ.presets.list.filter(function (p) { return p.cat === cat; }).map(function (p) { return { value: p.id, label: p.name + ((p.needs || []).length ? ' ★' : '') }; }) };
    }));
    var tgl = function (label, key) { return el('div', { class: 'toggle-row field' }, [el('span', { class: 'lbl', text: label }), U.toggle(st[key], set(key))]); };

    return el('div', { class: 'card' }, [
      el('h3', { text: 'Style' }),
      el('div', { class: 'stage-wrap' }, [canvas, el('span', { class: 'tag', text: 'Preview' })]),
      el('div', { class: 'row' }, [U.field('Font', V.fontSel), U.field('Size', U.number(st.size, 10, 400, 1, set('size')), 'xs')]),
      el('div', { class: 'row' }, [U.field('Fill', U.swatch(st.fill, set('fill')), 'sm'), U.field('Stroke', U.swatch(st.stroke, set('stroke')), 'sm'), U.field('Width', U.number(st.strokeWidth, 0, 60, 1, set('strokeWidth')), 'xs')]),
      el('div', { class: 'row' }, [tgl('Stroke', 'strokeOn'), tgl('Shadow', 'shadowOn')]),
      el('div', { class: 'row' }, [U.field('Tracking', U.number(st.tracking, -200, 1000, 10, set('tracking')), 'sm'), U.field('Line length', U.number(st.maxChars, 0, 120, 1, function (v) { st.maxChars = v; saveStyle(); }), 'sm'), U.field('Case', U.seg([{ label: 'Aa', value: false }, { label: 'AA', value: true }], st.caps, set('caps')), 'sm')]),
      el('div', { class: 'row' }, [el('div', { class: 'field', style: { flex: '0 0 auto' } }, [el('label', { text: 'Position' }), posgrid]),
        el('div', { class: 'field' }, [el('label', { text: 'Offset X' }), U.number(st.offX, -1500, 1500, 5, set('offX')), el('label', { text: 'Offset Y', style: { marginTop: '.4rem' } }), U.number(st.offY, -1000, 1000, 5, set('offY'))])]),
      el('div', { class: 'row' }, [tgl('Background box', 'boxOn')]),
      el('div', { class: 'row' }, [U.field('Box', U.swatch(st.box, set('box')), 'sm'), U.field('Opacity', U.number(st.boxOpacity, 0, 100, 5, set('boxOpacity')), 'xs'), U.field('Pad', U.number(st.boxPadX, 0, 200, 2, function (v) { st.boxPadX = v; st.boxPadY = Math.round(v * 0.55); saveStyle(); }), 'xs'), U.field('Round', U.number(st.boxRound, 0, 100, 1, set('boxRound')), 'xs')]),
      el('div', { class: 'row' }, [tgl('Word highlight', 'hlOn')]),
      el('div', { class: 'row' }, [U.field('Highlight', U.swatch(st.hl, set('hl')), 'sm'), U.field('Mode', U.seg([{ label: 'Current', value: 'current' }, { label: 'Fill up', value: 'progressive' }], st.hlMode, set('hlMode')))]),
      el('div', { class: 'row' }, [U.field('Animation', U.select(anims, st.anim, set('anim'))), U.field('Speed', U.number(st.speed, 0.25, 4, 0.25, set('speed')), 'xs')])
    ]);
  }

  /* ---------------------------------------------------------- build */
  function build(root) {
    V.source = el('div', { class: 'card source empty' });
    V.engine = U.select([{ value: 'whisperx', label: 'WhisperX' }, { value: 'whispercpp', label: 'Whisper.cpp' }], S.engine, function (v) { S.engine = v; U.store.set('engine', v); });
    var langs = CQ.languages.map(function (l) { return { value: l.code, label: l.name }; });
    V.lang = U.select(langs, S.lang, function (v) { S.lang = v; U.store.set('lang', v); });
    V.gen = el('button', { class: 'btn primary block', onclick: generate }, [U.icon('wand'), 'Generate Captions']);
    V.progStage = el('span', { class: 'stage' });
    V.pct = el('span', { class: 'pct' });
    V.barFill = el('i');
    V.bar = el('div', { class: 'bar' }, [V.barFill]);
    V.steps = el('div', { class: 'steps' }, STEPS.map(function (s) { return el('span', { text: s[1] }); }));
    V.cancel = el('button', { class: 'btn ghost danger', onclick: cancel }, [U.icon('stop'), 'Cancel']);
    V.prog = el('div', { class: 'card progress hidden' }, [el('div', { class: 'head' }, [V.progStage, V.pct, V.cancel]), V.bar, V.steps]);

    V.groupChips = el('div', { class: 'chips' });
    [['auto', 'Auto'], [1, '1'], [2, '2'], [4, '4'], [5, '5']].forEach(function (g) {
      V.groupChips.appendChild(el('button', { class: 'chip', 'data-g': g[0], text: g[1], onclick: function () { setGrouping(g[0]); } }));
    });
    var customInput = el('input', { type: 'number', min: 1, max: C.CUSTOM_MAX, value: S.custom });
    customInput.addEventListener('click', function (e) { e.stopPropagation(); });
    customInput.addEventListener('change', function () {
      var v = Math.round(Number(customInput.value));
      if (!(v >= 1 && v <= C.CUSTOM_MAX)) { customInput.value = S.custom; U.toast('warn', 'Custom', '1 – ' + C.CUSTOM_MAX + ' words'); return; }
      S.custom = v; U.store.set('customWords', v); if (S.grouping === 'custom') regroup(); else setGrouping('custom');
    });
    V.groupChips.appendChild(el('button', { class: 'chip', 'data-g': 'custom', onclick: function () { setGrouping('custom'); } }, ['Custom', customInput]));

    V.trCount = el('span', { class: 'badge info' });
    V.trBadge = el('span');
    V.trList = el('div', { class: 'tr-list' });
    V.trCard = el('div', { class: 'card hidden' }, [
      el('h3', null, [el('span', { class: 'grow', text: 'Transcript' }), V.trCount, V.trBadge]),
      el('div', { class: 'lbl', text: 'Words per caption' }),
      V.groupChips, V.trList
    ]);
    V.create = el('button', { class: 'btn primary block', disabled: true, onclick: createLayers }, [U.icon('text'), 'Create Text Layers']);

    var left = el('div', null, [
      V.source,
      el('div', { class: 'card' }, [el('div', { class: 'row' }, [U.field('Engine', V.engine), U.field('Language', V.lang)]), V.gen]),
      V.prog, V.trCard
    ]);
    var right = el('div', null, [styleCard(), el('div', { class: 'sticky-action' }, [V.create])]);
    root.appendChild(el('div', { class: 'cap-layout' }, [left, right]));
    renderSource(null);
    root.ownerDocument.defaultView.addEventListener('beforeunload', function () { if (S.job) S.job.cancel(); });
  }

  CQ.captionsView = {
    build: build,
    onSelection: function (sel) { if (V.source) renderSource(sel); },
    onFonts: function () { if (V.fontSel) { var nv = U.select(fontOptions(), S.style.font, function (v) { S.style.font = v; saveStyle(); }); V.fontSel.parentNode.replaceChild(nv, V.fontSel); V.fontSel = nv; } },
    onEngines: function (eng) { if (!V.engine) return; U.$$('option', V.engine).forEach(function (o) { o.disabled = !eng[o.value]; o.textContent = (o.value === 'whisperx' ? 'WhisperX' : 'Whisper.cpp') + (eng[o.value] ? '' : ' (missing)'); }); },
    state: S,
    _test: { regroup: regroup }
  };
})(typeof window !== 'undefined' ? window : global);

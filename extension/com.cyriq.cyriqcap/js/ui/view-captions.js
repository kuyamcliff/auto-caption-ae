/* Captions tab: transcribe, edit, style, create text layers. */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui, el = U.el, C = CQ.captions;

  // sizes are for a 1080 px short side; they scale with the composition
  var DEFAULT_STYLE = {
    font: 'Montserrat-ExtraBold', size: 64, caps: false, tracking: 0, lines: 2, lineChars: 28,
    fill: '#ffffff', strokeOn: true, stroke: '#000000', strokeWidth: 6, shadowOn: true,
    place: 'bottom', margin: 120, justify: 'center',
    boxOn: false, box: '#000000', boxOpacity: 60,
    hlOn: false, hl: '#ffd400',
    anim: 'none', speed: 1
  };
  var GROUPING = [['auto', 'Auto'], [1, '1 word'], [2, '2 words'], [3, '3 words'], [4, '4 words'], [5, '5 words'], [6, '6 words'], [8, '8 words'], [10, '10 words']];

  var S = {
    plan: null, job: null, running: false, words: null, captions: [], dirty: false,
    grouping: U.store.get('grouping3', 'auto'),
    model: U.store.get('model', CQ.models.DEFAULT), lang: U.store.get('lang', 'auto'),
    sub: U.store.get('capSub', 'transcript'),
    comp: { width: 1920, height: 1080, frameRate: 30 },
    previewIdx: 0,
    style: (function () { var s = U.store.get('style3', {}), o = {}, k; for (k in DEFAULT_STYLE) o[k] = s[k] != null ? s[k] : DEFAULT_STYLE[k]; return o; })()
  };
  var V = {}, player = null;

  function k() { return Math.min(S.comp.width, S.comp.height) / 1080; }
  function saveStyle() { U.store.set('style3', S.style); refreshPreview(); }

  /* ---------------------------------------------------------- source */
  var KIND = { 'video-audio': 'Video', audio: 'Audio', precomp: 'Precomp' };
  function sourceState(sel) {
    var layers = (sel && sel.layers) || [];
    var usable = layers.filter(function (l) { return KIND[l.kind]; });
    if (!sel || !sel.comp) return { cls: 'warn', ico: 'warn', t: 'No composition open', s: 'Open a composition', ok: false };
    if (!layers.length) return { cls: '', ico: 'layers', t: 'Select a layer with audio', s: 'Video, audio or precomp in the timeline', ok: false };
    if (!usable.length) return { cls: 'bad', ico: 'alert', t: layers[0].name, s: 'This layer has no audio', ok: false };
    if (usable.length > 1) return { cls: 'warn', ico: 'warn', t: usable.length + ' layers selected', s: 'Select only one', ok: false };
    var l = usable[0];
    if (l.fileExists === false) return { cls: 'bad', ico: 'alert', t: l.name, s: 'Media file is missing', ok: false };
    return { cls: 'ok', ico: l.kind === 'audio' ? 'wave' : l.kind === 'precomp' ? 'layers' : 'film', t: l.name, s: KIND[l.kind] + '  ·  ' + C.fmtTime(l.inPoint) + ' – ' + C.fmtTime(l.outPoint), ok: true };
  }
  function renderSource(sel) {
    var st = sourceState(sel);
    V.source.className = 'tile source ' + st.cls;
    U.clear(V.source);
    V.source.appendChild(U.svg(st.ico));
    V.source.appendChild(el('div', { class: 'grow' }, [el('div', { class: 't', text: st.t }), el('div', { class: 's', text: st.s })]));
    V.gen.disabled = S.running || !st.ok;
    if (sel && sel.comp) {
      var c = sel.comp;
      if (c.width !== S.comp.width || c.height !== S.comp.height) { S.comp = { width: c.width, height: c.height, frameRate: c.frameRate }; buildStage(); }
    }
  }

  /* ---------------------------------------------------------- models */
  function renderModels() {
    var st = CQ.app.modelStatus || [];
    var inst = st.filter(function (m) { return m.installed; });
    if (inst.length && !inst.some(function (m) { return m.id === S.model; })) S.model = inst[0].id;
    var opts = inst.length ? inst.map(function (m) { return { value: m.id, label: m.name }; }) : [{ value: '', label: 'No model', disabled: true }];
    var sel = U.select(opts, S.model, function (v) { S.model = v; U.store.set('model', v); });
    sel.title = 'Larger models are more accurate but slower';
    if (V.modelSel && V.modelSel.parentNode) V.modelSel.parentNode.replaceChild(sel, V.modelSel);
    V.modelSel = sel;
  }

  /* ---------------------------------------------------------- generate */
  var HOST = {
    NO_COMP: ['No composition open', 'Open a composition and select a layer.'],
    NO_SELECTION: ['Nothing selected', 'Select a video, audio or precomp layer in the timeline.'],
    UNSUPPORTED_LAYER: ['This layer has no audio', 'Select a layer with sound, or a precomp that contains audio.'],
    MULTIPLE_SOURCES: ['Select one layer', 'Several layers with audio are selected.'],
    NO_AUDIO: ['No audio inside', 'The precomp has no audible layers.'],
    FILE_MISSING: ['Media file missing', 'Relink the footage in After Effects, then try again.'],
    NO_FILE: ['No media file', 'This layer does not come from a media file.']
  };
  function hostError(r) { var m = HOST[r.code] || ['Could not read the selection', 'Select the layer again and retry.']; U.dialog({ kind: 'warn', title: m[0], text: m[1] }); }

  function generate() {
    if (S.running) return;
    if (!CQ.app.apiReady()) return;
    if (!S.model) { CQ.modelsUI.open(); return; }
    var go = function () {
      CQ.host.call('getAudioPlan', {}).then(function (r) { if (!r.ok) return hostError(r); startJob(r); },
        function () { U.dialog({ kind: 'err', title: 'After Effects is busy', text: 'Wait a moment and try again.' }); });
    };
    if (S.dirty && S.captions.length) U.dialog({ kind: 'warn', title: 'Replace your edits?', text: 'Generating again replaces the edited transcript.', actions: [{ label: 'Cancel' }, { label: 'Replace', primary: true, onClick: go }] });
    else go();
  }

  var STAGES = ['extracting', 'loading', 'transcribing', 'aligning'];
  function showProgress(p) {
    var i = STAGES.indexOf(p.state);
    V.progLabel.textContent = p.label || 'Working';
    var indet = p.pct == null;
    V.bar.classList.toggle('indet', indet);
    V.barFill.style.width = indet ? '' : Math.round((p.pct || 0) * 100) + '%';
    V.pct.textContent = indet ? '' : Math.round((p.pct || 0) * 100) + '%';
    U.$$('span', V.steps).forEach(function (s, j) { s.className = j < i ? 'done' : j === i ? 'now' : ''; });
  }

  function startJob(plan) {
    S.plan = plan; S.running = true;
    if (plan.comp) S.comp = { width: plan.comp.width, height: plan.comp.height, frameRate: plan.comp.frameRate };
    V.gen.classList.add('hidden'); V.prog.classList.remove('hidden');
    showProgress({ state: 'extracting', pct: 0, label: 'Preparing audio' });
    CQ.app.busy(true);
    var o = { apiDir: CQ.app.apiDir, model: S.model, language: S.lang, plan: plan, onProgress: showProgress, pythonOk: CQ.app.pythonOk };
    var job = CQ.services.hasNode ? new CQ.services.TranscriptionJob(o) : CQ.mockHost.transcriptionJob(o);
    S.job = job;
    job.start().then(function (r) {
      S.words = r.words; S.dirty = false; S.previewIdx = 0;
      if (r.wordTiming !== 'aligned' && CQ.app.pythonOk == null) CQ.app.pythonOk = false;
      regroup();
      setSub('transcript');
      U.toast('ok', 'Transcript ready', S.captions.length + ' captions');
    }, function (e) {
      if (e.code === 'CANCELLED') return;
      var f = CQ.services.friendly(e);
      U.dialog({ kind: 'err', title: f.title, text: f.text, actions: e.code === 'MODEL_MISSING' ? [{ label: 'Close' }, { label: 'Get Models', primary: true, onClick: CQ.modelsUI.open }] : null });
    }).then(function () {
      S.running = false; S.job = null;
      V.prog.classList.add('hidden'); V.gen.classList.remove('hidden');
      CQ.app.busy(false);
      renderSource(CQ.app.selection);
    });
  }

  /* ---------------------------------------------------------- transcript */
  function maxChars() { return S.style.lineChars * S.style.lines; }
  function regroup() {
    if (!S.words) return;
    var groups = C.groupWords(S.words, S.grouping, { maxChars: maxChars() });
    var r = S.plan.range;
    S.captions = C.fitTiming(groups, { offset: r.start, compStart: r.start, compEnd: r.end, fps: S.plan.comp.frameRate });
    S.dirty = false;
    renderTranscript(); refreshPreview(); updateFoot();
  }

  function autosize(t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }

  function renderTranscript() {
    U.clear(V.tr);
    if (!S.words) {
      V.tr.appendChild(el('div', { class: 'empty' }, [U.svg('captions'), el('div', { text: 'Generate captions to edit the text here.' })]));
      return;
    }
    var fps = S.plan.comp.frameRate;
    var gsel = U.select(GROUPING.map(function (g) { return { value: String(g[0]), label: g[1] }; }), String(S.grouping), function (v) {
      var apply = function () { S.grouping = v === 'auto' ? 'auto' : Number(v); U.store.set('grouping3', S.grouping); regroup(); };
      if (S.dirty) U.dialog({ kind: 'warn', title: 'Regroup captions?', text: 'Your text edits will be replaced.', actions: [{ label: 'Cancel', onClick: renderTranscript }, { label: 'Regroup', primary: true, onClick: apply }] });
      else apply();
    });
    V.count = el('span', { class: 'count', text: S.captions.length + ' captions' });
    V.tr.appendChild(el('div', { class: 'trbar' }, [el('label', { text: 'Words' }), gsel, V.count]));
    var list = el('div', { class: 'list' });
    S.captions.forEach(function (c, i) {
      var a = el('input', { value: C.fmtTime(c.start, fps), title: 'Start (mm:ss:ff)' });
      var b = el('input', { value: C.fmtTime(c.end, fps), title: 'End (mm:ss:ff)' });
      function time(inp, key) {
        inp.addEventListener('change', function () {
          var v = C.parseTime(inp.value, fps);
          var okv = isFinite(v) && (key === 'start' ? v < c.end : v > c.start);
          inp.classList.toggle('bad', !okv);
          if (okv) { c[key] = v; c.words = C.retime(c); S.dirty = true; inp.value = C.fmtTime(v, fps); }
        });
      }
      time(a, 'start'); time(b, 'end');
      var t = el('textarea', { rows: 1, spellcheck: 'false' });
      t.value = c.text;
      t.addEventListener('input', function () { c.text = t.value.replace(/\s*\n\s*/g, ' '); c.words = C.retime(c); S.dirty = true; autosize(t); if (S.previewIdx === i) refreshPreview(); });
      t.addEventListener('focus', function () { S.previewIdx = i; refreshPreview(); });
      var del = el('button', { class: 'iconbtn del', title: 'Delete caption', html: CQ.icons.trash, onclick: function () { S.captions.splice(i, 1); S.dirty = true; renderTranscript(); updateFoot(); } });
      var row = el('div', { class: 'cap', style: { animationDelay: Math.min(i, 20) * 12 + 'ms' } }, [el('div', { class: 'tm' }, [a, b]), t, del]);
      list.appendChild(row);
      setTimeout(function () { autosize(t); }, 0);
    });
    V.tr.appendChild(list);
  }

  /* ---------------------------------------------------------- style */
  function previewText() {
    var c = S.captions[S.previewIdx] || S.captions[0];
    return C.wrapLines(c ? c.text : 'Your captions will look like this', S.style.lineChars, S.style.lines).replace(/\r/g, '\n');
  }
  function captionPreset() {
    var st = S.style, kk = k();
    var base = st.anim !== 'none' ? CQ.presets.byId(st.anim) : null;
    var p = base ? JSON.parse(JSON.stringify(base)) : { id: 'static', name: 'Static', anims: [], fx: [] };
    p.font = st.font;
    p.sample = previewText();
    p.style = { size: st.size * kk, fill: st.fill, tracking: st.tracking, caps: st.caps, stroke: st.strokeOn ? { color: st.stroke, width: st.strokeWidth * kk } : null, leading: 1.15 };
    p.anims = (p.anims || []).filter(function (a) { return !(a.props && a.props.fill) && !a.wordColors; });
    if (st.hlOn) p.anims.push({ based: 'words', props: { fill: st.hl }, t: { phase: 'karaoke', step: 0.35 } });
    p.extras = (p.extras || []).filter(function (e) { return e.type !== 'captionBox'; });
    if (st.boxOn) p.extras.unshift({ type: 'captionBox', color: st.box, opacity: st.boxOpacity / 100, pad: [22 * kk, 10 * kk], round: 6 * kk });
    p.bg = '#2a2d33';
    if (st.shadowOn) p.fx = (p.fx || []).concat([{ fx: 'shadow', color: '#000000', opacity: 70, distance: 3, softness: 8 }]);
    return p;
  }
  function refreshPreview() {
    if (!player) return;
    var st = S.style;
    player.setPreset(captionPreset());
    player.setOptions({ speed: st.speed, frameW: S.comp.width, frameH: S.comp.height, noFit: true, place: { v: st.place, h: st.justify, margin: st.margin * k() }, justify: st.justify });
    if (st.anim === 'none' && !st.hlOn) { U.ticker.pause(player, true); player.draw(1); } else U.ticker.pause(player, false);
  }
  function buildStage() {
    if (!V.stage) return;
    if (player) U.ticker.remove(player);
    U.clear(V.stage);
    var tall = S.comp.height > S.comp.width;
    var w = tall ? 270 : 480, h = Math.round(w * S.comp.height / S.comp.width);
    var cv = el('canvas', { width: w * 2, height: h * 2 });
    V.stage.className = 'stage' + (tall ? ' tall' : '');
    V.stage.appendChild(cv);
    V.stage.appendChild(el('span', { class: 'tag', text: S.comp.width + '×' + S.comp.height }));
    player = new CQ.preview.Player(cv, captionPreset(), { fps: 30 });
    U.ticker.add(player, 0.2);
    refreshPreview();
  }

  function fontGroups() {
    var F = CQ.presets.FONTS;
    var groups = [{ group: 'CyriqCap', items: Object.keys(F).map(function (ps) { return { value: ps, label: F[ps].css, css: F[ps].css }; }) }];
    if (CQ.app.aeFonts && CQ.app.aeFonts.length) {
      var W = { thin: 100, extralight: 200, light: 300, regular: 400, normal: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, black: 900, heavy: 900 };
      groups.push({ group: 'Installed', items: CQ.app.aeFonts.map(function (f) {
        var st = String(f.style || '').toLowerCase().replace(/[\s-]/g, '');
        var wt = 400; for (var key in W) if (st.indexOf(key) >= 0) wt = W[key];
        return { value: f.ps, label: f.family + (f.style && !/^regular$/i.test(f.style) ? ' ' + f.style : ''), css: f.family, weight: wt, style: /italic|oblique/.test(st) ? 'italic' : 'normal' };
      }) });
    }
    return groups;
  }

  function styleView() {
    var st = S.style;
    function set(key) { return function (v) { st[key] = v; saveStyle(); }; }
    function setWrap(key) { return function (v) { st[key] = v; saveStyle(); if (S.words && !S.dirty) regroup(); }; }
    V.stage = el('div', { class: 'stage' });
    V.font = U.fontPicker(fontGroups, st.font, set('font'));
    var anims = [{ value: 'none', label: 'None' }].concat(CQ.presets.CATEGORIES.slice(1).map(function (cat) {
      return { group: cat, items: CQ.presets.list.filter(function (p) { return p.cat === cat; }).map(function (p) { return { value: p.id, label: p.name + ((p.needs || []).length ? '  (plug-in)' : '') }; }) };
    }));
    var box = el('div', null, [
      V.stage,
      U.group('Text', [
        U.prop('Font', V.font),
        U.prop('Size', [U.scrub(st.size, { min: 8, max: 300, unit: 'px' }, set('size'))]),
        U.prop('Case', U.seg([{ label: 'Aa', value: false, title: 'As typed' }, { label: 'AA', value: true, title: 'All caps' }], st.caps, set('caps'))),
        U.prop('Tracking', U.scrub(st.tracking, { min: -100, max: 400 }, set('tracking'))),
        U.prop('Lines', U.seg([{ label: '1', value: 1 }, { label: '2', value: 2 }], st.lines, setWrap('lines'))),
        U.prop('Line length', U.scrub(st.lineChars, { min: 8, max: 80, unit: 'chars' }, setWrap('lineChars')))
      ], { key: 'text' }),
      U.group('Color', [
        U.prop('Fill', U.swatch(st.fill, set('fill'))),
        U.prop('Stroke', [U.sw(st.strokeOn, set('strokeOn')), U.swatch(st.stroke, set('stroke')), U.scrub(st.strokeWidth, { min: 0, max: 60, unit: 'px' }, set('strokeWidth'))]),
        U.prop('Shadow', U.sw(st.shadowOn, set('shadowOn')))
      ], { key: 'color' }),
      U.group('Position', [
        U.prop('Place', U.seg([{ icon: 'alignTop', value: 'top', title: 'Top' }, { icon: 'alignMid', value: 'middle', title: 'Middle' }, { icon: 'alignBot', value: 'bottom', title: 'Bottom' }], st.place, set('place'))),
        U.prop('Align', U.seg([{ icon: 'alignL', value: 'left', title: 'Left' }, { icon: 'alignC', value: 'center', title: 'Center' }, { icon: 'alignR', value: 'right', title: 'Right' }], st.justify, set('justify'))),
        U.prop('Margin', U.scrub(st.margin, { min: 0, max: 600, unit: 'px' }, set('margin')))
      ], { key: 'pos' }),
      U.group('Background', [
        U.prop('Color', U.swatch(st.box, set('box'))),
        U.prop('Opacity', U.scrub(st.boxOpacity, { min: 0, max: 100, unit: '%' }, set('boxOpacity')))
      ], { key: 'box', open: false, toggle: { on: st.boxOn, onChange: set('boxOn') } }),
      U.group('Word highlight', [
        U.prop('Color', U.swatch(st.hl, set('hl')))
      ], { key: 'hl', open: false, toggle: { on: st.hlOn, onChange: set('hlOn') } }),
      U.group('Animation', [
        U.prop('Preset', U.select(anims, st.anim, set('anim'))),
        U.prop('Speed', U.scrub(st.speed, { min: 0.25, max: 3, step: 0.05, dec: 2, unit: '×', per: 0.01 }, set('speed')))
      ], { key: 'anim', open: false }),
      el('div', { class: 'mt8' }, [el('button', { class: 'link', text: 'Reset style', onclick: function () { S.style = JSON.parse(JSON.stringify(DEFAULT_STYLE)); U.store.set('style3', S.style); renderSub(); if (S.words && !S.dirty) regroup(); } })])
    ]);
    setTimeout(buildStage, 0);
    return box;
  }

  /* ---------------------------------------------------------- create layers */
  function updateFoot() {
    var n = S.captions.length;
    V.create.disabled = !n;
    V.create.setLabel(n ? 'Create ' + n + ' Text Layer' + (n > 1 ? 's' : '') : 'Create Text Layers');
  }

  function createLayers() {
    if (!S.captions.length) return;
    var bad = S.captions.filter(function (c) { return !(c.end > c.start) || !String(c.text).trim(); }).length + U.$$('.cap .tm input.bad', V.tr).length;
    if (bad) { setSub('transcript'); U.dialog({ kind: 'warn', title: 'Check the transcript', text: 'Some captions have no text or invalid times. They are marked in red.' }); return; }
    var st = S.style;
    var preset = st.anim !== 'none' ? CQ.presets.byId(st.anim) : null;
    if (preset && (preset.needs || []).length) {
      var miss = preset.needs.filter(function (n) { return !CQ.app.plugins[n]; });
      if (miss.length) { CQ.animate.pluginDialog(preset, miss); return; }
    }
    CQ.host.call('getSelection').then(function (sel) {
      if (!sel.comp) { U.dialog({ kind: 'warn', title: 'No composition open', text: 'Open the composition you transcribed.' }); return; }
      var kk = Math.min(sel.comp.width, sel.comp.height) / 1080;
      var payload = {
        captions: S.captions.map(function (c) {
          var o = { text: C.wrapLines(c.text, st.lineChars, st.lines), start: c.start, end: c.end };
          if (st.hlOn && c.words && c.words.length) o.highlightExpr = CQ.builder.highlightExpr(c.words, 'current');
          return o;
        }),
        style: { font: st.font, size: st.size * kk, fill: st.fill, stroke: st.strokeOn ? { color: st.stroke, width: st.strokeWidth * kk } : null, tracking: st.tracking, justify: st.justify, caps: st.caps, leading: 1.15 },
        place: { v: st.place, h: st.justify, margin: st.margin * kk },
        box: st.boxOn ? { color: st.box, opacity: st.boxOpacity, padX: 22 * kk, padY: 10 * kk, round: 6 * kk } : null,
        shadow: st.shadowOn ? { fx: 'shadow', color: '#000000', opacity: 70, distance: 3 * kk, softness: 8 * kk } : null,
        highlight: st.hlOn ? { color: st.hl } : null,
        preset: preset ? CQ.builder.build(preset, { useFont: false, useColors: false, speed: st.speed }) : null,
        aboveLayerIndex: S.plan ? S.plan.layer.index : null,
        prefix: 'Caption'
      };
      V.create.setBusy(true);
      return CQ.host.call('createCaptions', payload).then(function (r) {
        V.create.setBusy(false);
        if (!r.ok) { CQ.services.Log.error(null, 'createCaptions ' + r.code + ' ' + r.message); U.dialog({ kind: 'err', title: 'Could not create the captions', text: 'Nothing was changed. Make sure the composition is open and not locked, then try again.' }); return; }
        U.toast('ok', r.created + ' layers created', 'Ctrl+Z to undo');
        if ((r.warnings || []).some(function (w) { return w.indexOf('FONT_MISSING') === 0; })) CQ.app.fontMissing();
      });
    }).catch(function () { V.create.setBusy(false); U.dialog({ kind: 'err', title: 'After Effects is busy', text: 'Wait a moment and try again.' }); });
  }

  /* ---------------------------------------------------------- layout */
  function setSub(s) { S.sub = s; U.store.set('capSub', s); renderSub(); }
  function renderSub() {
    U.$$('button', V.subSeg).forEach(function (b, i) { b.classList.toggle('active', (i === 0) === (S.sub === 'transcript')); });
    if (player) { U.ticker.remove(player); player = null; }
    V.stage = null;
    U.clear(V.body);
    if (S.sub === 'transcript') { V.tr = el('div'); V.body.appendChild(V.tr); renderTranscript(); }
    else V.body.appendChild(styleView());
  }

  function build(rootEl) {
    V.source = el('div', { class: 'tile source' });
    V.gen = U.btn('Generate Captions', { cls: 'primary block', icon: 'captions', onClick: generate });
    V.progLabel = el('span', { class: 'lbl' }); V.pct = el('span', { class: 'pct' });
    V.barFill = el('i'); V.bar = el('div', { class: 'bar' }, [V.barFill]);
    V.steps = el('div', { class: 'steps' }, [el('span'), el('span'), el('span'), el('span')]);
    V.prog = el('div', { class: 'tile progress hidden' }, [
      el('div', { class: 'row1' }, [V.progLabel, V.pct, el('button', { class: 'link', text: 'Cancel', onclick: function () { if (S.job) S.job.cancel(); } })]),
      V.bar, V.steps
    ]);
    renderModels();
    var langs = CQ.languages.map(function (l) { return { value: l.code, label: l.name }; });
    var langSel = U.select(langs, S.lang, function (v) { S.lang = v; U.store.set('lang', v); });
    var dl = U.btn('', { cls: 'icon', icon: 'download', title: 'Download more models', onClick: function () { CQ.modelsUI.open(); } });
    V.subSeg = U.seg([{ label: 'Transcript', value: 'transcript' }, { label: 'Style', value: 'style' }], S.sub, setSub, 'full');
    V.body = el('div');
    V.create = U.btn('Create Text Layers', { cls: 'primary block', icon: 'text', onClick: createLayers });
    rootEl.appendChild(el('div', { class: 'scroll' }, [
      V.source,
      el('div', { class: 'grid2 mb8' }, [U.field('Model', el('div', { class: 'pair' }, [el('div', { class: 'grow' }, [V.modelSel]), dl])), U.field('Language', langSel)]),
      V.gen, V.prog,
      el('div', { class: 'subtabs' }, [V.subSeg]),
      V.body
    ]));
    rootEl.appendChild(el('div', { class: 'foot' }, [V.create]));
    renderSource(null);
    renderSub();
    updateFoot();
  }

  CQ.captionsView = {
    build: build,
    onSelection: function (sel) { if (!S.running) renderSource(sel); },
    onModels: renderModels,
    onFonts: function () { if (V.font) V.font.refresh(); },
    state: S
  };
})(typeof window !== 'undefined' ? window : global);

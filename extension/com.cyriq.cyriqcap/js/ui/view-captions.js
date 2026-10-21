/* Captions tab. */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui, el = U.el, C = CQ.captions;

  var DEFAULT_STYLE = {
    font: 'Montserrat-Bold', size: 72, fill: '#ffffff', strokeOn: true, stroke: '#000000', strokeWidth: 5, tracking: 0,
    caps: false, place: 'bottom', margin: 110, justify: 'center', maxChars: 32,
    boxOn: false, box: '#000000', boxOpacity: 65, hlOn: false, hl: '#ffd400', shadowOn: true, anim: 'none', speed: 1
  };
  var S = {
    plan: null, job: null, running: false, words: null, captions: [], dirty: false, wordTiming: null,
    grouping: U.store.get('grouping', 'auto'), custom: U.store.get('customWords', 3),
    model: U.store.get('model', CQ.models.DEFAULT), lang: U.store.get('lang', 'auto'),
    style: (function () { var s = U.store.get('style2', {}), o = {}, k; for (k in DEFAULT_STYLE) o[k] = s[k] != null ? s[k] : DEFAULT_STYLE[k]; return o; })()
  };
  var V = {}, player = null;

  function saveStyle() { U.store.set('style2', S.style); refreshPreview(); }

  /* ---------------------------------------------------------- source */
  var KIND = { 'video-audio': 'Video', audio: 'Audio', precomp: 'Precomp', video: 'Video', text: 'Text', shape: 'Shape', solid: 'Solid' };
  function renderSource(sel) {
    var layers = (sel && sel.layers) || [];
    var usable = layers.filter(function (l) { return l.kind === 'audio' || l.kind === 'video-audio' || l.kind === 'precomp'; });
    var cls = 'source', ico = 'layers', t, s;
    if (!sel || !sel.comp) { cls += ' warn'; ico = 'warn'; t = 'No composition open'; s = 'Open a composition in After Effects'; }
    else if (!layers.length) { ico = 'layers'; t = 'Select a layer in the timeline'; s = 'Audio, video or precomp'; }
    else if (!usable.length) { cls += ' bad'; ico = 'alert'; t = layers[0].name; s = 'This layer has no audio'; }
    else if (usable.length > 1) { cls += ' warn'; ico = 'warn'; t = usable.length + ' layers selected'; s = 'Select one layer'; }
    else {
      var l = usable[0];
      ico = l.kind === 'audio' ? 'wave' : l.kind === 'precomp' ? 'layers' : 'film';
      t = l.name; s = KIND[l.kind] + ' · ' + C.fmtTime(l.inPoint) + ' – ' + C.fmtTime(l.outPoint);
      if (l.fileExists === false) { cls += ' bad'; ico = 'alert'; s = 'Media file is missing'; }
    }
    V.source.className = cls;
    V.source.innerHTML = '';
    V.source.appendChild(U.svg(ico));
    V.source.appendChild(el('div', { class: 'grow' }, [el('div', { class: 't', text: t }), el('div', { class: 's', text: s })]));
    V.gen.disabled = S.running || !(usable.length === 1 && usable[0].fileExists !== false);
  }

  /* ---------------------------------------------------------- models */
  function renderModels() {
    var st = CQ.app.modelStatus || [];
    var opts = st.filter(function (m) { return m.installed; }).map(function (m) { return { value: m.id, label: m.name }; });
    if (!opts.length) opts = [{ value: '', label: 'No model installed', disabled: true }];
    if (!st.some(function (m) { return m.id === S.model && m.installed; })) { var f = st.filter(function (m) { return m.installed; })[0]; S.model = f ? f.id : ''; }
    var sel = U.select(opts, S.model, function (v) { S.model = v; U.store.set('model', v); });
    if (V.modelSel && V.modelSel.parentNode) V.modelSel.parentNode.replaceChild(sel, V.modelSel);
    V.modelSel = sel;
  }

  /* ---------------------------------------------------------- generate */
  var HOST = {
    NO_COMP: ['No composition open', 'Open a composition and select a layer.'],
    NO_SELECTION: ['Nothing selected', 'Select an audio, video or precomp layer in the timeline.'],
    UNSUPPORTED_LAYER: ['This layer has no audio', 'Select a layer with sound, or a precomp that contains audio.'],
    MULTIPLE_SOURCES: ['Select one layer', 'Several layers with audio are selected. Select only the one to caption.'],
    NO_AUDIO: ['No audio inside', 'The precomp has no audible layers.'],
    FILE_MISSING: ['Media file missing', 'Relink the footage in After Effects, then try again.'],
    NO_FILE: ['No media file', 'This layer does not come from a media file.']
  };
  function hostError(r) { var m = HOST[r.code] || ['Could not read the selection', 'Try selecting the layer again.']; U.dialog({ kind: 'warn', title: m[0], text: m[1] }); }

  function generate() {
    if (S.running) return;
    if (!CQ.app.apiReady()) return;
    if (!S.model) { CQ.modelsUI.open(); return; }
    var go = function () {
      CQ.host.call('getAudioPlan', {}).then(function (r) { if (!r.ok) return hostError(r); startJob(r); },
        function () { U.dialog({ kind: 'err', title: 'After Effects is not responding', text: 'Wait a moment and try again.' }); });
    };
    if (S.dirty && S.captions.length) U.dialog({ kind: 'warn', title: 'Replace your edits?', text: 'Generating again replaces the edited transcript.', actions: [{ label: 'Cancel' }, { label: 'Replace', primary: true, onClick: go }] });
    else go();
  }

  function showProgress(p) {
    V.prog.classList.remove('hidden');
    V.progLabel.textContent = p.label || 'Working';
    var indet = p.pct == null;
    V.bar.classList.toggle('indet', indet);
    V.barFill.style.width = indet ? '' : Math.round((p.pct || 0) * 100) + '%';
    V.pct.textContent = indet ? '' : Math.round((p.pct || 0) * 100) + '%';
  }

  function startJob(plan) {
    S.plan = plan; S.running = true;
    V.gen.classList.add('hidden');
    showProgress({ pct: 0, label: 'Preparing audio' });
    CQ.app.busy(true);
    var job = CQ.services.hasNode
      ? new CQ.services.TranscriptionJob({ apiDir: CQ.app.apiDir, model: S.model, language: S.lang, plan: plan, onProgress: showProgress })
      : CQ.mockHost.transcriptionJob({ model: S.model, language: S.lang, plan: plan, onProgress: showProgress });
    S.job = job;
    job.start().then(function (r) {
      S.words = r.words; S.wordTiming = r.wordTiming; S.dirty = false;
      regroup();
      U.toast('ok', 'Transcript ready', r.words.length + ' words');
    }, function (e) {
      if (e.code === 'CANCELLED') return;
      var f = CQ.services.friendly(e);
      U.dialog({ kind: 'err', title: f.title, text: f.text, actions: e.code === 'MODEL_MISSING' ? [{ label: 'Close' }, { label: 'Models', primary: true, onClick: CQ.modelsUI.open }] : null });
    }).then(function () {
      S.running = false; S.job = null;
      V.prog.classList.add('hidden'); V.gen.classList.remove('hidden');
      CQ.app.busy(false);
      renderSource(CQ.app.selection);
    });
  }

  /* ---------------------------------------------------------- transcript */
  function regroup() {
    if (!S.words) return;
    var groups;
    try { groups = C.groupWords(S.words, S.grouping, { custom: S.custom, maxChars: S.style.maxChars }); }
    catch (e) { U.toast('warn', 'Words per caption', '1 to ' + C.CUSTOM_MAX); return; }
    var r = S.plan.range;
    S.captions = C.fitTiming(groups, { offset: r.start, compStart: r.start, compEnd: r.end, fps: S.plan.comp.frameRate });
    S.dirty = false;
    renderTranscript(); refreshPreview();
  }

  function renderTranscript() {
    V.tr.classList.toggle('hidden', !S.words);
    if (!S.words) return;
    V.trInfo.textContent = S.captions.length + ' captions';
    var list = V.list; list.innerHTML = '';
    var fps = S.plan.comp.frameRate;
    S.captions.forEach(function (c, i) {
      var a = el('input', { class: 'input', value: C.fmtTime(c.start, fps), title: 'Start' });
      var b = el('input', { class: 'input', value: C.fmtTime(c.end, fps), title: 'End' });
      var ta = el('textarea', { class: 'input', rows: 1 });
      ta.value = c.text;
      function fit() { ta.style.height = 'auto'; ta.style.height = Math.max(24, ta.scrollHeight + 2) + 'px'; }
      ta.addEventListener('input', function () { c.text = ta.value; c.words = C.retime(c); S.dirty = true; fit(); if (i === 0) refreshPreview(); });
      function onTime(inp, key) {
        inp.addEventListener('change', function () {
          var v = C.parseTime(inp.value, fps);
          var ok = isFinite(v) && v >= S.plan.range.start - 1e-6 && v <= S.plan.range.end + 1e-6;
          var prev = c[key];
          if (ok) { c[key] = v; ok = c.end > c.start; if (!ok) c[key] = prev; }
          inp.classList.toggle('bad', !ok);
          if (ok) { inp.value = C.fmtTime(v, fps); c.words = C.retime(c); S.dirty = true; }
        });
      }
      onTime(a, 'start'); onTime(b, 'end');
      list.appendChild(el('div', { class: 'row' }, [el('div', { class: 'times' }, [a, b]), ta,
        el('button', { class: 'del', title: 'Delete', html: CQ.icons.trash, onclick: function () { S.captions.splice(i, 1); S.dirty = true; renderTranscript(); } })]));
      setTimeout(fit, 0);
    });
    V.create.disabled = !S.captions.length;
  }

  function setGrouping(g) {
    var apply = function () { S.grouping = g; U.store.set('grouping', g); regroup(); renderGroupSeg(); };
    if (S.dirty) U.dialog({ kind: 'warn', title: 'Regroup captions?', text: 'Your text edits will be replaced.', actions: [{ label: 'Cancel', onClick: function () { renderGroupSeg(); } }, { label: 'Regroup', primary: true, onClick: apply }] });
    else apply();
  }
  function renderGroupSeg() {
    var items = [{ label: 'Auto', value: 'auto' }, { label: '1', value: 1 }, { label: '2', value: 2 }, { label: '4', value: 4 }, { label: '5', value: 5 }];
    var seg = U.seg(items.concat([{ label: 'Custom', value: 'custom' }]), S.grouping, setGrouping);
    var cbtn = seg.lastChild;
    var ci = el('input', { type: 'number', min: 1, max: C.CUSTOM_MAX, value: S.custom });
    ci.addEventListener('click', function (e) { e.stopPropagation(); });
    ci.addEventListener('change', function () {
      var v = Math.round(Number(ci.value));
      if (!(v >= 1 && v <= C.CUSTOM_MAX)) { ci.value = S.custom; U.toast('warn', 'Words per caption', '1 to ' + C.CUSTOM_MAX); return; }
      S.custom = v; U.store.set('customWords', v); setGrouping('custom');
    });
    cbtn.className += ' custom';
    if (S.grouping === 'custom') cbtn.appendChild(ci);
    if (V.groupSeg && V.groupSeg.parentNode) V.groupSeg.parentNode.replaceChild(seg, V.groupSeg);
    V.groupSeg = seg;
  }

  /* ---------------------------------------------------------- create layers */
  function createLayers() {
    if (!S.captions.length) return;
    var bad = U.$$('.row .times input.bad', V.list).length + S.captions.filter(function (c) { return !(c.end > c.start) || !String(c.text).trim(); }).length;
    if (bad) { U.dialog({ kind: 'warn', title: 'Check the transcript', text: 'Some captions have no text or invalid times. Fix the rows marked in red.' }); return; }
    var st = S.style;
    var preset = st.anim !== 'none' ? CQ.presets.byId(st.anim) : null;
    if (preset && (preset.needs || []).length) {
      var miss = preset.needs.filter(function (n) { return !CQ.app.plugins[n]; });
      if (miss.length) { CQ.animate.pluginDialog(preset, miss); return; }
    }
    CQ.host.call('getSelection').then(function (sel) {
      if (!sel.comp) { U.dialog({ kind: 'warn', title: 'No composition open', text: 'Open the composition you transcribed.' }); return; }
      var k = sel.comp.height / 1080, W = sel.comp.width, H = sel.comp.height, m = st.margin * k;
      var x = st.justify === 'left' ? m : st.justify === 'right' ? W - m : W / 2;
      var y = st.place === 'top' ? m : st.place === 'middle' ? H / 2 : H - m;
      var payload = {
        captions: S.captions.map(function (c) {
          var o = { text: C.wrapLines(c.text, st.maxChars), start: c.start, end: c.end };
          if (st.hlOn && c.words && c.words.length) o.highlightExpr = CQ.builder.highlightExpr(c.words, 'current');
          return o;
        }),
        style: { font: st.font, size: st.size * k, fill: st.fill, stroke: st.strokeOn ? { color: st.stroke, width: st.strokeWidth * k } : null, tracking: st.tracking, justify: st.justify, caps: st.caps },
        position: [x, y], anchor: { v: st.place, h: st.justify },
        box: st.boxOn ? { color: st.box, opacity: st.boxOpacity, padX: 24 * k, padY: 12 * k, round: 8 * k } : null,
        shadow: st.shadowOn ? { fx: 'shadow', color: '#000000', opacity: 70, distance: 3, softness: 8 } : null,
        highlight: st.hlOn ? { color: st.hl } : null,
        preset: preset ? CQ.builder.build(preset, { useFont: false, useColors: false, speed: st.speed }) : null,
        aboveLayerIndex: S.plan ? S.plan.layer.index : null,
        prefix: 'Caption'
      };
      V.create.setBusy(true);
      return CQ.host.call('createCaptions', payload).then(function (r) {
        V.create.setBusy(false);
        if (!r.ok) { U.dialog({ kind: 'err', title: 'Could not create the captions', text: 'Nothing was changed. Check that the composition is open and not locked, then try again.' }); CQ.services.Log.error(null, 'createCaptions ' + r.code + ' ' + r.message); return; }
        U.toast('ok', r.created + ' caption layers created', 'Press Ctrl+Z to undo.');
        var fonts = (r.warnings || []).filter(function (w) { return w.indexOf('FONT_MISSING') === 0; });
        if (fonts.length) CQ.app.fontMissing();
      });
    }).catch(function () { V.create.setBusy(false); U.dialog({ kind: 'err', title: 'After Effects is not responding', text: 'Wait a moment and try again.' }); });
  }

  /* ---------------------------------------------------------- preview */
  function captionPreset() {
    var st = S.style;
    var base = st.anim !== 'none' ? CQ.presets.byId(st.anim) : null;
    var p = base ? JSON.parse(JSON.stringify(base)) : { id: 'static', name: 'Static', anims: [], fx: [] };
    p.font = st.font;
    var text = (S.captions[0] && S.captions[0].text) || 'Your captions will look like this';
    p.sample = C.wrapLines(text, st.maxChars).replace(/\r/g, '\n');
    p.style = { size: st.size, fill: st.fill, tracking: st.tracking, caps: st.caps, stroke: st.strokeOn ? { color: st.stroke, width: st.strokeWidth } : null, leading: 1.15 };
    p.anims = (p.anims || []).filter(function (a) { return !(a.props && a.props.fill) && !a.wordColors; });
    if (st.hlOn) p.anims.push({ based: 'words', props: { fill: st.hl }, t: { phase: 'karaoke', step: 0.35 } });
    p.extras = (p.extras || []).slice();
    if (st.boxOn) p.extras.unshift({ type: 'captionBox', color: st.box, opacity: st.boxOpacity / 100, pad: [24, 12], round: 8 });
    p.bg = '#1a1a1a';
    if (st.shadowOn) p.fx = (p.fx || []).concat([{ fx: 'shadow', color: '#000000', opacity: 70, distance: 3, softness: 8 }]);
    return p;
  }
  function refreshPreview() {
    if (!player) return;
    player.setPreset(captionPreset());
    player.setOptions({ speed: S.style.speed, place: { v: S.style.place, h: S.style.justify, margin: S.style.margin }, justify: S.style.justify, keepSize: true });
  }

  function fontOptions() {
    var F = CQ.presets.FONTS;
    var groups = [{ group: 'CyriqCap fonts', items: Object.keys(F).map(function (ps) { return { value: ps, label: F[ps].css }; }) }];
    if (CQ.app.aeFonts && CQ.app.aeFonts.length) groups.push({ group: 'Installed fonts', items: CQ.app.aeFonts.map(function (f) { return { value: f.ps, label: f.family + ' ' + f.style }; }) });
    return groups;
  }

  function styleSection() {
    var st = S.style;
    function set(k) { return function (v) { st[k] = v; saveStyle(); }; }
    var canvas = el('canvas', { width: 640, height: 360 });
    player = new CQ.preview.Player(canvas, captionPreset(), { fps: 30 });
    U.watch(canvas, player);
    refreshPreview();
    V.fontSel = U.select(fontOptions(), st.font, set('font'));
    var anims = [{ value: 'none', label: 'None' }].concat(CQ.presets.CATEGORIES.slice(1).map(function (cat) {
      return { group: cat, items: CQ.presets.list.filter(function (p) { return p.cat === cat; }).map(function (p) { return { value: p.id, label: p.name }; }) };
    }));
    return el('div', { class: 'section' }, [
      el('div', { class: 'title', text: 'Style' }),
      el('div', { class: 'stage' }, [canvas]),
      el('div', { class: 'grid3' }, [
        U.field('Font', V.fontSel, 'span2'), U.field('Size', U.number(st.size, 8, 400, 1, set('size'))),
        U.field('Fill', U.color(st.fill, set('fill'))), U.field('Stroke', U.color(st.stroke, set('stroke'))), U.field('Stroke width', U.number(st.strokeWidth, 0, 60, 1, set('strokeWidth'))),
        U.field('Position', U.seg([{ icon: 'alignTop', value: 'top', title: 'Top' }, { icon: 'alignMid', value: 'middle', title: 'Middle' }, { icon: 'alignBot', value: 'bottom', title: 'Bottom' }], st.place, set('place'))),
        U.field('Margin', U.number(st.margin, 0, 1000, 5, set('margin'))),
        U.field('Align', U.seg([{ icon: 'alignL', value: 'left', title: 'Left' }, { icon: 'alignC', value: 'center', title: 'Center' }, { icon: 'alignR', value: 'right', title: 'Right' }], st.justify, set('justify'))),
        U.field('Tracking', U.number(st.tracking, -200, 1000, 10, set('tracking'))), U.field('Line length', U.number(st.maxChars, 0, 120, 1, set('maxChars'))),
        U.field('Case', U.seg([{ label: 'Aa', value: false, title: 'As typed' }, { label: 'AA', value: true, title: 'Uppercase' }], st.caps, set('caps'))),
        U.field('Box', U.color(st.box, set('box'))), U.field('Box opacity', U.number(st.boxOpacity, 0, 100, 5, set('boxOpacity'))), U.field('Highlight', U.color(st.hl, set('hl'))),
        el('div', { class: 'span3 line' }, [U.check('Stroke', st.strokeOn, set('strokeOn')), U.check('Shadow', st.shadowOn, set('shadowOn')), U.check('Box', st.boxOn, set('boxOn')), U.check('Highlight word', st.hlOn, set('hlOn'))]),
        U.field('Animation', U.select(anims, st.anim, set('anim')), 'span2'), U.field('Speed', U.number(st.speed, 0.25, 4, 0.25, set('speed')))
      ])
    ]);
  }

  /* ---------------------------------------------------------- build */
  function build(rootEl) {
    V.source = el('div', { class: 'source' });
    V.modelSel = el('select', { class: 'input' });
    V.lang = U.select(CQ.languages.map(function (l) { return { value: l.code, label: l.name }; }), S.lang, function (v) { S.lang = v; U.store.set('lang', v); });
    V.gen = U.btn('Generate Captions', { cls: 'primary block', icon: 'captions', onClick: generate });
    V.progLabel = el('span'); V.pct = el('span', { class: 'pct' }); V.barFill = el('i'); V.bar = el('div', { class: 'bar' }, [V.barFill]);
    V.prog = el('div', { class: 'progress hidden' }, [el('div', { class: 'top' }, [V.progLabel, V.pct, el('button', { class: 'link', text: 'Cancel', onclick: function () { if (S.job) S.job.cancel(); } })]), V.bar]);
    V.trInfo = el('span', { class: 'tag' });
    V.list = el('div', { class: 'list' });
    V.groupSeg = el('div');
    V.tr = el('div', { class: 'section hidden' }, [
      el('div', { class: 'title' }, ['Transcript', el('span', { class: 'spacer' }), V.trInfo]),
      U.field('Words per caption', V.groupSeg), el('div', { style: { height: '.5rem' } }), V.list
    ]);
    V.create = U.btn('Create Text Layers', { cls: 'primary block', icon: 'text', onClick: createLayers });
    V.create.disabled = true;
    rootEl.appendChild(el('div', { class: 'section' }, [
      V.source,
      el('div', { class: 'grid2' }, [
        el('div', { class: 'field' }, [el('label', { text: 'Model' }), el('div', { class: 'line' }, [el('div', { class: 'grow' }, [V.modelSel]), U.btn('', { cls: 'icon', icon: 'download', title: 'Get more models', onClick: function () { CQ.modelsUI.open(); } })])]),
        U.field('Language', V.lang)
      ]),
      el('div', { style: { height: '.6rem' } }), V.gen, V.prog
    ]));
    rootEl.appendChild(V.tr);
    rootEl.appendChild(styleSection());
    rootEl.appendChild(V.create);
    renderGroupSeg(); renderModels(); renderSource(null);
    root.addEventListener('beforeunload', function () { if (S.job) S.job.cancel(); });
  }

  CQ.captionsView = {
    build: build,
    onSelection: function (sel) { if (V.source) renderSource(sel); },
    onModels: function () { if (V.modelSel) renderModels(); },
    onFonts: function () { if (V.fontSel) { var nv = U.select(fontOptions(), S.style.font, function (v) { S.style.font = v; saveStyle(); }); V.fontSel.parentNode.replaceChild(nv, V.fontSel); V.fontSel = nv; } },
    state: S
  };
})(typeof window !== 'undefined' ? window : global);

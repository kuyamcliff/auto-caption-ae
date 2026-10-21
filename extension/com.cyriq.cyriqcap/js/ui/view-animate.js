/* Text Animation & Effects tab. Independent from Auto Caption. */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui, el = U.el;

  var S = {
    cat: U.store.get('animCat', 'All'), q: '', selected: null,
    opts: U.store.get('animOpts', { speed: 1, useFont: true, useColors: true, fill: '#ffffff', glow: '#2a7bff', overrideFill: false, overrideGlow: false }),
    text: U.store.get('animText', ''), textLayers: 0
  };
  var V = {}, cards = [], bigPlayer = null;

  function saveOpts() { U.store.set('animOpts', S.opts); updateBig(); }

  function needsLabel(p) { return (p.needs || []).map(function (n) { return CQ.presets.PLUGINS[n].name.replace('Boris FX ', ''); }).join(' + '); }
  function missing(p) { return (p.needs || []).filter(function (n) { return !CQ.app.plugins[n]; }); }

  function pluginModal(p, miss) {
    return U.modal({
      kind: 'err', icon: 'plug', title: p.name + ' needs a plug-in',
      text: 'This preset uses effects that are not installed in your After Effects:',
      list: miss.map(function (n) { var pl = CQ.presets.PLUGINS[n]; return pl.name + ' (' + pl.vendor + ')'; }),
      actions: [{ label: 'Close' }, { label: 'Re-scan plug-ins', primary: true, onClick: function () { CQ.app.scanPlugins(true).then(function () { renderCards(); }); } }]
    });
  }

  /* ---------------------------------------------------------- grid */
  function visible() {
    var q = S.q.trim().toLowerCase();
    return CQ.presets.list.filter(function (p) {
      if (S.cat !== 'All' && p.cat !== S.cat) return false;
      if (q && (p.name + ' ' + p.cat + ' ' + p.id).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function renderCards() {
    cards.forEach(function (c) { c.player.stop(); });
    cards = [];
    V.grid.innerHTML = '';
    var list = visible();
    V.count.textContent = list.length;
    if (!list.length) {
      V.grid.appendChild(el('div', { class: 'empty-state', style: { gridColumn: '1 / -1' } }, [el('span', { html: CQ.icons.search }), el('b', { text: 'No presets found' })]));
      return;
    }
    list.forEach(function (p, i) {
      var cv = el('canvas', { width: 320, height: 180 });
      var miss = missing(p);
      var card = el('div', { class: 'preset' + (S.selected && S.selected.id === p.id ? ' active' : ''), title: p.name }, [
        cv,
        el('div', { class: 'cap' }, [el('span', { class: 'nm', text: p.name }), (p.needs || []).length ? el('span', { class: 'need' + (miss.length ? ' missing' : ''), text: needsLabel(p) }) : null])
      ]);
      card.style.animationDelay = Math.min(i, 16) * 0.025 + 's';
      var pl = new CQ.preview.Player(cv, p, { fps: 24, text: S.text || null });
      pl.paused = false;
      // stagger start so cards don't animate in lockstep
      pl._t = (i * 0.37) % pl.tl.total;
      pl.draw(pl.tl.pad + pl.tl.inDur + 0.4);
      U.watch(cv, pl);
      card.addEventListener('click', function () { select(p, card); });
      V.grid.appendChild(card);
      cards.push({ p: p, card: card, player: pl });
    });
  }

  function select(p, card) {
    var miss = missing(p);
    S.selected = p;
    cards.forEach(function (c) { c.card.classList.toggle('active', c.p.id === p.id); });
    renderDetail();
    var view = document.getElementById('view-animate');
    if (view && root.innerWidth < 760 && view.scrollTop > 0) view.scrollTo ? view.scrollTo({ top: 0, behavior: 'smooth' }) : (view.scrollTop = 0);
    if (miss.length) pluginModal(p, miss);
  }

  /* ---------------------------------------------------------- detail */
  function previewOpts() {
    var o = { speed: S.opts.speed, text: S.text || null, fps: 30 };
    return o;
  }

  function effectivePreset() {
    var p = JSON.parse(JSON.stringify(S.selected));
    if (S.opts.overrideFill) { p.style.fill = S.opts.fill; if (p.style.lineColors) p.style.lineColors = p.style.lineColors.map(function (c, i) { return i === p.style.lineColors.length - 1 ? S.opts.fill : c; }); }
    if (S.opts.overrideGlow) (p.fx || []).forEach(function (f) { if (f.fx === 'glow' && f.color !== 'auto') f.color = S.opts.glow; });
    return p;
  }

  function updateBig() {
    if (!bigPlayer || !S.selected) return;
    bigPlayer.setPreset(effectivePreset());
    bigPlayer.setOptions(previewOpts());
  }

  function renderDetail() {
    V.detail.innerHTML = '';
    if (bigPlayer) { bigPlayer.stop(); bigPlayer = null; }
    var p = S.selected;
    if (!p) {
      V.detail.appendChild(el('div', { class: 'card' }, [el('div', { class: 'empty-state' }, [el('span', { html: CQ.icons.sparkle }), el('b', { text: 'Pick a preset' })])]));
      return;
    }
    var cv = el('canvas', { width: 640, height: 360 });
    bigPlayer = new CQ.preview.Player(cv, effectivePreset(), previewOpts());
    bigPlayer.paused = false;
    U.watch(cv, bigPlayer);
    var playBtn = el('button', { class: 'btn icon ghost play', title: 'Play / pause', html: CQ.icons.pause });
    playBtn.addEventListener('click', function () {
      bigPlayer.paused = !bigPlayer.paused;
      if (bigPlayer.paused) bigPlayer.stop(false); else bigPlayer.start();
      playBtn.innerHTML = bigPlayer.paused ? CQ.icons.play : CQ.icons.pause;
    });
    var textIn = el('input', { class: 'input', value: S.text, placeholder: p.sample.replace(/\n/g, ' / ') });
    textIn.addEventListener('input', function () {
      S.text = textIn.value; U.store.set('animText', S.text);
      updateBig();
      clearTimeout(textIn._t); textIn._t = setTimeout(function () { cards.forEach(function (c) { c.player.setOptions({ text: S.text || null }); }); }, 400);
    });
    var o = S.opts;
    var speedLbl = el('span', { class: 'lbl', text: o.speed.toFixed(2) + '×' });
    var miss = missing(p);
    V.apply = el('button', { class: 'btn primary block', onclick: apply }, [U.icon('wand'), 'Apply']);
    V.remove = el('button', { class: 'btn ghost', onclick: removePreset, title: 'Remove CyriqCap animation from selected layers' }, [U.icon('trash'), 'Remove']);
    var fillSw = U.swatch(o.fill, function (v) { o.fill = v; saveOpts(); });
    var glowSw = U.swatch(o.glow, function (v) { o.glow = v; saveOpts(); });
    V.detail.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'title' }, [el('b', { text: p.name }), el('span', { class: 'badge info', text: p.cat }), miss.length ? el('span', { class: 'badge warn', text: needsLabel(p) }) : null]),
      el('div', { class: 'stage-wrap' }, [cv, el('span', { class: 'tag', text: (CQ.presets.FONTS[p.font] || {}).css || '' }), playBtn]),
      U.field('Preview text', textIn),
      el('div', { class: 'row', style: { marginTop: '.5rem' } }, [
        el('div', { class: 'field' }, [el('div', { style: { display: 'flex', justifyContent: 'space-between' } }, [el('span', { class: 'lbl', text: 'Speed' }), speedLbl]),
          U.range(0.25, 3, 0.05, o.speed, function (v) { o.speed = v; speedLbl.textContent = v.toFixed(2) + '×'; clearTimeout(speedLbl._t); speedLbl._t = setTimeout(saveOpts, 120); })])
      ]),
      el('div', { class: 'row' }, [
        el('div', { class: 'toggle-row field' }, [el('span', { class: 'lbl', text: 'Preset font' }), U.toggle(o.useFont, function (v) { o.useFont = v; saveOpts(); })]),
        el('div', { class: 'toggle-row field' }, [el('span', { class: 'lbl', text: 'Preset colors' }), U.toggle(o.useColors, function (v) { o.useColors = v; saveOpts(); })])
      ]),
      el('div', { class: 'row' }, [
        el('div', { class: 'toggle-row field' }, [el('span', { class: 'lbl', text: 'Text color' }), U.toggle(o.overrideFill, function (v) { o.overrideFill = v; saveOpts(); })]),
        el('div', { class: 'toggle-row field' }, [el('span', { class: 'lbl', text: 'Glow color' }), U.toggle(o.overrideGlow, function (v) { o.overrideGlow = v; saveOpts(); })])
      ]),
      el('div', { class: 'row' }, [U.field('Text', fillSw, 'sm'), U.field('Glow', glowSw, 'sm')]),
      el('div', { class: 'row', style: { alignItems: 'stretch' } }, [el('div', { style: { flex: '1 1 auto' } }, [V.apply]), V.remove])
    ]));
    updateApplyState();
  }

  function updateApplyState() {
    if (!V.apply) return;
    V.apply.disabled = !S.textLayers;
    V.apply.lastChild.textContent = S.textLayers > 1 ? 'Apply to ' + S.textLayers + ' layers' : 'Apply';
    if (V.remove) V.remove.disabled = !S.textLayers;
  }

  /* ---------------------------------------------------------- apply */
  function apply() {
    var p = S.selected;
    if (!p) return;
    var miss = missing(p);
    if (miss.length) { pluginModal(p, miss); return; }
    var opts = { speed: S.opts.speed, useFont: S.opts.useFont, useColors: S.opts.useColors };
    if (S.opts.overrideFill) opts.fill = S.opts.fill;
    if (S.opts.overrideGlow) opts.glow = S.opts.glow;
    var built = CQ.builder.build(p, opts);
    V.apply.classList.add('loading');
    CQ.host.call('applyPreset', { preset: built }).then(function (r) {
      V.apply.classList.remove('loading');
      if (!r.ok) {
        if (r.code === 'NO_TEXT_LAYERS') U.modal({ kind: 'warn', icon: 'text', title: 'Select text layers', text: 'Select one or more text layers in the timeline.', list: (r.skipped || []).slice(0, 5).map(function (s) { return s.name + ' — ' + s.reason; }) });
        else if (r.code === 'PLUGIN_MISSING') { (r.missing || []).forEach(function (n) { CQ.app.plugins[n] = false; }); pluginModal(p, r.missing || []); renderCards(); }
        else if (r.code === 'NO_COMP') U.modal({ kind: 'warn', title: 'No composition', text: 'Open a composition first.' });
        else U.modal({ kind: 'err', title: 'Could not apply', text: r.message });
        return;
      }
      var okN = r.results.filter(function (x) { return x.ok; }).length;
      var failed = r.results.filter(function (x) { return !x.ok; });
      var warns = [];
      r.results.forEach(function (x) { (x.warnings || []).forEach(function (w) { if (warns.indexOf(w) < 0) warns.push(w); }); });
      var fonts = warns.filter(function (w) { return w.indexOf('FONT_MISSING') === 0; }).map(function (w) { return w.split(':')[1]; });
      var other = warns.filter(function (w) { return w.indexOf('FONT_MISSING') !== 0; });
      if (failed.length) U.modal({ kind: 'err', title: 'Applied to ' + okN + ' of ' + r.results.length + ' layers', list: failed.map(function (f) { return f.name + ': ' + f.error; }) });
      else U.toast('ok', p.name + ' applied', okN + ' layer' + (okN > 1 ? 's' : '') + (r.skipped && r.skipped.length ? ' · ' + r.skipped.length + ' skipped' : ''));
      if (fonts.length) CQ.app.fontMissing(fonts);
      if (other.length) { CQ.services.Log.warn(null, 'apply ' + p.id + ' warnings: ' + other.join(' | ')); U.toast('warn', 'Applied with notes', other.slice(0, 2).join(' · ')); }
    }, function (e) { V.apply.classList.remove('loading'); U.modal({ kind: 'err', title: 'After Effects did not respond', text: e.message }); });
  }

  function removePreset() {
    CQ.host.call('removePreset').then(function (r) {
      if (r.ok) U.toast('ok', 'Animation removed', r.cleared + ' layer' + (r.cleared === 1 ? '' : 's'));
      else U.toast('err', 'Could not remove', r.message);
    });
  }

  /* ---------------------------------------------------------- build */
  function build(rootEl) {
    var search = el('input', { class: 'input', placeholder: 'Search', value: '' });
    search.addEventListener('input', function () { S.q = search.value; clearTimeout(search._t); search._t = setTimeout(renderCards, 150); });
    V.selPill = el('span', { class: 'pill sel-pill' }, [el('span', { class: 'dot', id: 'textSelDot' }), el('span', { text: '0 text layers' })]);
    V.count = el('span', { class: 'badge info' });
    var chips = el('div', { class: 'chips' });
    CQ.presets.CATEGORIES.forEach(function (c) {
      var b = el('button', { class: 'chip' + (c === S.cat ? ' active' : ''), text: c });
      b.addEventListener('click', function () { S.cat = c; U.store.set('animCat', c); U.$$('.chip', chips).forEach(function (x) { x.classList.toggle('active', x === b); }); renderCards(); });
      chips.appendChild(b);
    });
    V.grid = el('div', { class: 'grid' });
    V.detail = el('div', { class: 'detail' });
    var left = el('div', null, [
      el('div', { class: 'toolbar' }, [el('div', { class: 'search' }, [el('span', { html: CQ.icons.search }), search]), V.selPill]),
      el('div', { style: { display: 'flex', alignItems: 'center' } }, [chips, el('span', { class: 'spacer' }), V.count]),
      V.grid
    ]);
    rootEl.appendChild(el('div', { class: 'anim-layout' }, [left, V.detail]));
    // skeletons while fonts load
    for (var i = 0; i < 8; i++) V.grid.appendChild(el('div', { class: 'preset' }, [el('div', { class: 'skeleton', style: { paddingTop: '56.25%' } }), el('div', { class: 'cap' }, [el('span', { class: 'nm skeleton', style: { height: '.7rem', borderRadius: '.3rem' } })])]));
    renderDetail();
  }

  function onSelection(sel) {
    var n = sel && sel.layers ? sel.layers.filter(function (l) { return l.kind === 'text'; }).length : 0;
    S.textLayers = n;
    if (V.selPill) {
      V.selPill.lastChild.textContent = n + ' text layer' + (n === 1 ? '' : 's');
      V.selPill.firstChild.className = 'dot ' + (n ? 'ok' : 'warn');
    }
    updateApplyState();
  }

  CQ.animate = { build: build, ready: function () { renderCards(); if (!S.selected) { S.selected = visible()[0] || null; renderDetail(); renderCards(); } }, onSelection: onSelection, pluginModal: pluginModal, refresh: renderCards, state: S };
})(typeof window !== 'undefined' ? window : global);

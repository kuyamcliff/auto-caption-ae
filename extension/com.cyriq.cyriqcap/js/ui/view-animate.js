/* Animate tab: presets for any selected text layers. Independent from Captions. */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui, el = U.el;

  var S = {
    cat: U.store.get('animCat', 'All'), q: '', selected: null, textLayers: 0,
    opts: U.store.get('animOpts2', { speed: 1, useFont: true, useColors: true, overrideFill: false, fill: '#ffffff' }),
    text: U.store.get('animText', '')
  };
  var V = {}, cards = [], big = null;

  function save() { U.store.set('animOpts2', S.opts); updateBig(); }
  function missing(p) { return (p.needs || []).filter(function (n) { return !CQ.app.plugins[n]; }); }
  function needsLabel(p) { return (p.needs || []).map(function (n) { return CQ.presets.PLUGINS[n].name.replace('Boris FX ', ''); }).join(', '); }

  function pluginDialog(p, miss) {
    return U.dialog({
      kind: 'warn', icon: 'plug', title: p.name + ' needs a plug-in',
      text: 'Install the plug-in below, then scan again. Nothing was changed in your project.',
      list: miss.map(function (n) { var pl = CQ.presets.PLUGINS[n]; return pl.name + ' by ' + pl.vendor; }),
      actions: [{ label: 'Close' }, { label: 'Scan Again', primary: true, onClick: function () { CQ.app.scanPlugins(true).then(renderCards); } }]
    });
  }

  function visible() {
    var q = S.q.trim().toLowerCase();
    return CQ.presets.list.filter(function (p) {
      if (S.cat !== 'All' && p.cat !== S.cat) return false;
      return !q || (p.name + ' ' + p.cat).toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderCards() {
    cards.forEach(function (c) { c.player.stop(); });
    cards = [];
    V.cards.innerHTML = '';
    var list = visible();
    V.count.textContent = list.length + ' presets';
    list.forEach(function (p, i) {
      var cv = el('canvas', { width: 288, height: 162 });
      var miss = missing(p);
      var card = el('div', { class: 'card' + (S.selected && S.selected.id === p.id ? ' active' : ''), title: p.name }, [cv,
        el('div', { class: 'nm' }, [el('span', { text: p.name }), (p.needs || []).length ? el('i', { class: 'plug' + (miss.length ? ' missing' : ''), title: 'Needs ' + needsLabel(p), html: CQ.icons.plug }) : null])]);
      var pl = new CQ.preview.Player(cv, p, { fps: 24, text: S.text || null });
      // still frame; plays while the pointer is over the card
      pl.paused = true;
      pl.stop(true);
      card.addEventListener('mouseenter', function () { pl._t = 0; pl.start(); });
      card.addEventListener('mouseleave', function () { pl.stop(true); });
      card.addEventListener('click', function () { select(p); });
      V.cards.appendChild(card);
      cards.push({ p: p, card: card, player: pl });
    });
  }

  function select(p) {
    S.selected = p;
    cards.forEach(function (c) { c.card.classList.toggle('active', c.p.id === p.id); });
    renderDetail();
    var view = document.getElementById('view-animate');
    if (root.innerWidth < 760 && view) view.scrollTop = 0;
    var miss = missing(p);
    if (miss.length) pluginDialog(p, miss);
  }

  function effective() {
    var p = JSON.parse(JSON.stringify(S.selected));
    if (S.opts.overrideFill) { p.style.fill = S.opts.fill; if (p.style.lineColors) p.style.lineColors = p.style.lineColors.map(function (c, i, a) { return i === a.length - 1 ? S.opts.fill : c; }); }
    return p;
  }
  function updateBig() { if (big && S.selected) { big.setPreset(effective()); big.setOptions({ speed: S.opts.speed, text: S.text || null }); } }

  function renderDetail() {
    V.detail.innerHTML = '';
    if (big) { big.stop(); big = null; }
    var p = S.selected;
    if (!p) return;
    var cv = el('canvas', { width: 640, height: 360 });
    big = new CQ.preview.Player(cv, effective(), { speed: S.opts.speed, text: S.text || null, fps: 30 });
    big.paused = false;
    U.watch(cv, big);
    var play = U.btn('', { cls: 'icon play', icon: 'pause', title: 'Play / pause' });
    play.addEventListener('click', function () {
      big.paused = !big.paused;
      if (big.paused) big.stop(false); else big.start();
      play.innerHTML = CQ.icons[big.paused ? 'play' : 'pause'];
    });
    var txt = el('input', { class: 'input', value: S.text, placeholder: p.sample.replace(/\n/g, ' ') });
    txt.addEventListener('input', function () {
      S.text = txt.value; U.store.set('animText', S.text); updateBig();
      clearTimeout(txt._t); txt._t = setTimeout(function () { cards.forEach(function (c) { c.player.setOptions({ text: S.text || null }); c.player.stop(true); }); }, 400);
    });
    var o = S.opts;
    var spLbl = el('span', { class: 'muted', text: o.speed.toFixed(2) + '×' });
    V.apply = U.btn('Apply', { cls: 'primary', icon: 'check', onClick: apply });
    V.remove = U.btn('Remove', { icon: 'trash', onClick: removePreset, title: 'Remove the CyriqCap animation from the selected layers' });
    V.detail.appendChild(el('div', { class: 'head' }, [el('b', { text: p.name }), el('span', { text: p.cat + ' · ' + ((CQ.presets.FONTS[p.font] || {}).css || '') })]));
    V.detail.appendChild(el('div', { class: 'stage' }, [cv, play]));
    V.detail.appendChild(el('div', { class: 'grid2' }, [
      U.field('Preview text', txt, 'span2'),
      el('div', { class: 'field span2' }, [el('label', null, ['Speed ', spLbl]), U.range(0.25, 3, 0.05, o.speed, function (v) { o.speed = v; spLbl.textContent = v.toFixed(2) + '×'; clearTimeout(spLbl._t); spLbl._t = setTimeout(save, 120); })]),
      U.check('Preset font', o.useFont, function (v) { o.useFont = v; save(); }),
      U.check('Preset colors', o.useColors, function (v) { o.useColors = v; save(); }),
      U.check('Custom color', o.overrideFill, function (v) { o.overrideFill = v; save(); }),
      U.color(o.fill, function (v) { o.fill = v; save(); })
    ]));
    V.detail.appendChild(el('div', { class: 'line', style: { marginTop: '.7rem' } }, [el('div', { class: 'grow' }, [V.apply]), V.remove]));
    V.apply.style.width = '100%';
    updateApplyState();
  }

  function updateApplyState() {
    if (V.apply) { V.apply.disabled = !S.textLayers; V.apply.lastChild.textContent = S.textLayers > 1 ? 'Apply to ' + S.textLayers + ' layers' : 'Apply'; }
    if (V.remove) V.remove.disabled = !S.textLayers;
  }

  function apply() {
    var p = S.selected; if (!p) return;
    var miss = missing(p);
    if (miss.length) { pluginDialog(p, miss); return; }
    var opts = { speed: S.opts.speed, useFont: S.opts.useFont, useColors: S.opts.useColors };
    if (S.opts.overrideFill) opts.fill = S.opts.fill;
    V.apply.setBusy(true);
    CQ.host.call('applyPreset', { preset: CQ.builder.build(p, opts) }).then(function (r) {
      V.apply.setBusy(false);
      if (!r.ok) {
        if (r.code === 'NO_TEXT_LAYERS') U.dialog({ kind: 'warn', icon: 'text', title: 'Select text layers', text: 'Select one or more text layers in the timeline, then click Apply.' });
        else if (r.code === 'PLUGIN_MISSING') { (r.missing || []).forEach(function (n) { CQ.app.plugins[n] = false; }); pluginDialog(p, r.missing || []); renderCards(); }
        else if (r.code === 'NO_COMP') U.dialog({ kind: 'warn', title: 'No composition open', text: 'Open a composition and select text layers.' });
        else { CQ.services.Log.error(null, 'apply ' + p.id + ' ' + r.code + ' ' + r.message); U.dialog({ kind: 'err', title: 'Could not apply the preset', text: 'Nothing was changed. Try again.' }); }
        return;
      }
      var ok = r.results.filter(function (x) { return x.ok; }).length, failed = r.results.length - ok;
      var notes = [];
      r.results.forEach(function (x) { (x.warnings || []).forEach(function (w) { notes.push(w); }); if (!x.ok) notes.push(x.name + ': ' + x.error); });
      if (notes.length) CQ.services.Log.warn(null, 'apply ' + p.id + ' notes: ' + notes.join(' | '));
      if (failed) U.dialog({ kind: 'warn', title: 'Applied to ' + ok + ' of ' + r.results.length + ' layers', text: 'Some layers could not be changed. Make sure they are unlocked text layers.' });
      else U.toast('ok', p.name + ' applied', ok + ' layer' + (ok > 1 ? 's' : '') + ' · keyframes at each layer’s start and end');
      if (notes.some(function (w) { return w.indexOf('FONT_MISSING') === 0; })) CQ.app.fontMissing();
    }, function () { V.apply.setBusy(false); U.dialog({ kind: 'err', title: 'After Effects is not responding', text: 'Wait a moment and try again.' }); });
  }

  function removePreset() {
    CQ.host.call('removePreset').then(function (r) { if (r.ok) U.toast('ok', 'Animation removed', r.cleared + ' layer' + (r.cleared === 1 ? '' : 's')); });
  }

  function build(rootEl) {
    var search = el('input', { class: 'input', placeholder: 'Search presets' });
    search.addEventListener('input', function () { S.q = search.value; clearTimeout(search._t); search._t = setTimeout(renderCards, 150); });
    V.sel = el('span', { class: 'count' });
    V.count = el('span', { class: 'count' });
    V.cards = el('div', { class: 'cards' });
    V.detail = el('div', { class: 'detail' });
    var cats = U.seg(CQ.presets.CATEGORIES.map(function (c) { return { label: c, value: c }; }), S.cat, function (c) { S.cat = c; U.store.set('animCat', c); renderCards(); });
    rootEl.appendChild(el('div', { class: 'split' }, [
      el('div', { class: 'side' }, [V.detail]),
      el('div', null, [
        el('div', { class: 'toolbar' }, [el('div', { class: 'search' }, [U.svg('search'), search]), V.sel]),
        el('div', { class: 'cats' }, [cats]),
        el('div', { class: 'line', style: { marginBottom: '.4rem' } }, [V.count]),
        V.cards
      ])
    ]));
  }

  function onSelection(sel) {
    var n = sel && sel.layers ? sel.layers.filter(function (l) { return l.kind === 'text'; }).length : 0;
    S.textLayers = n;
    if (V.sel) V.sel.textContent = n ? n + ' text layer' + (n > 1 ? 's' : '') + ' selected' : 'No text layer selected';
    updateApplyState();
  }

  CQ.animate = {
    build: build, onSelection: onSelection, pluginDialog: pluginDialog, pluginModal: pluginDialog, refresh: renderCards, state: S,
    ready: function () { if (!S.selected) S.selected = visible()[0] || CQ.presets.list[0]; renderCards(); renderDetail(); }
  };
})(typeof window !== 'undefined' ? window : global);

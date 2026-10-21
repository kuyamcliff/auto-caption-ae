/* Animate tab: live preset grid for any selected text layers. */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui, el = U.el;

  var S = {
    cat: U.store.get('animCat', 'All'), q: '', textLayers: 0,
    big: U.store.get('animBig', false),
    selected: null,
    opts: U.store.get('animOpts3', { speed: 1, useFont: true, useColors: true, overrideFill: false, fill: '#ffffff', text: '' })
  };
  var V = {}, cards = [];

  function save() { U.store.set('animOpts3', S.opts); }
  function missing(p) { return (p.needs || []).filter(function (n) { return !CQ.app.plugins[n]; }); }
  function needsLabel(p) { return (p.needs || []).map(function (n) { return CQ.presets.PLUGINS[n].name.replace('Boris FX ', ''); }).join(', '); }

  function pluginDialog(p, miss) {
    return U.dialog({
      kind: 'warn', icon: 'plug', title: p.name + ' needs a plug-in',
      text: 'Install it, then scan again. Nothing in your project was changed.',
      list: miss.map(function (n) { var pl = CQ.presets.PLUGINS[n]; return pl.name + ' (' + pl.vendor + ')'; }),
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

  function effective(p) {
    var x = JSON.parse(JSON.stringify(p));
    if (S.opts.overrideFill) { x.style.fill = S.opts.fill; if (x.style.lineColors) x.style.lineColors = x.style.lineColors.map(function () { return S.opts.fill; }); }
    return x;
  }

  function renderCards() {
    cards.forEach(function (c) { U.ticker.remove(c.player); });
    cards = [];
    U.clear(V.cards);
    V.cards.className = 'cards' + (S.big ? ' big' : '');
    var list = visible();
    if (!list.length) { V.cards.appendChild(el('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, [U.svg('search'), el('div', { text: 'No presets found' })])); return; }
    var w = S.big ? 400 : 264;
    list.forEach(function (p, i) {
      var cv = el('canvas', { width: w, height: Math.round(w * 9 / 16) });
      var miss = missing(p);
      var card = el('div', { class: 'card' + (S.selected && S.selected.id === p.id ? ' active' : ''), title: p.name + ((p.needs || []).length ? ' · needs ' + needsLabel(p) : '') + '\nDouble-click to apply', style: { animationDelay: Math.min(i, 24) * 15 + 'ms' } }, [cv,
        el('div', { class: 'nm' }, [el('span', { text: p.name }), (p.needs || []).length ? el('i', { class: miss.length ? 'missing' : '', html: CQ.icons.plug }) : null])]);
      var pl = new CQ.preview.Player(cv, effective(p), { fps: 24, text: S.opts.text || null, speed: S.opts.speed, maxFit: 2.4, fitWidth: 0.74, fitHeight: 0.62 });
      // stagger so the grid doesn't move in lockstep
      U.ticker.add(pl, (i * 0.23) % Math.max(0.5, pl.tl.inDur));
      card.addEventListener('click', function () { select(p, card, pl); });
      card.addEventListener('dblclick', function () { select(p, card, pl); apply(); });
      V.cards.appendChild(card);
      cards.push({ p: p, card: card, player: pl });
    });
  }

  function select(p, card, pl) {
    S.selected = p; U.store.set('animSel', p.id);
    cards.forEach(function (c) { c.card.classList.toggle('active', c.p.id === p.id); });
    if (pl) U.ticker.restart(pl);
    updateFoot();
    var miss = missing(p);
    if (miss.length) pluginDialog(p, miss);
  }

  function updateFoot() {
    var p = S.selected, n = S.textLayers;
    V.name.textContent = p ? p.name : 'Choose a preset';
    V.sub.textContent = n ? n + ' text layer' + (n > 1 ? 's' : '') + ' selected' : 'Select text layers in the timeline';
    V.apply.disabled = !p || !n;
    V.apply.setLabel(n > 1 ? 'Apply to ' + n : 'Apply');
  }

  function optionsPop() {
    var o = S.opts;
    function refresh() { save(); cards.forEach(function (c) { c.player.setPreset(effective(c.p)); c.player.setOptions({ speed: o.speed, text: o.text || null }); }); }
    var txt = el('input', { class: 'input', value: o.text, placeholder: 'Preset text' });
    txt.addEventListener('input', function () { o.text = txt.value; clearTimeout(txt._t); txt._t = setTimeout(refresh, 300); });
    var box = el('div', { class: 'menu' }, [
      U.prop('Speed', U.scrub(o.speed, { min: 0.25, max: 3, step: 0.05, dec: 2, unit: '×', per: 0.01 }, function (v) { o.speed = v; refresh(); })),
      U.prop('Preset font', U.sw(o.useFont, function (v) { o.useFont = v; save(); })),
      U.prop('Preset colors', U.sw(o.useColors, function (v) { o.useColors = v; save(); })),
      U.prop('Custom color', [U.sw(o.overrideFill, function (v) { o.overrideFill = v; refresh(); }), U.swatch(o.fill, function (v) { o.fill = v; if (o.overrideFill) refresh(); else save(); })]),
      U.prop('Preview text', txt)
    ]);
    U.popover(V.optBtn, box, { width: 250, alignRight: true });
  }

  function apply() {
    var p = S.selected; if (!p) return;
    if (!S.textLayers) { U.toast('warn', 'Select text layers first'); return; }
    var miss = missing(p);
    if (miss.length) { pluginDialog(p, miss); return; }
    var opts = { speed: S.opts.speed, useFont: S.opts.useFont, useColors: S.opts.useColors };
    if (S.opts.overrideFill) opts.fill = S.opts.fill;
    V.apply.setBusy(true);
    CQ.host.call('applyPreset', { preset: CQ.builder.build(p, opts) }).then(function (r) {
      V.apply.setBusy(false);
      if (!r.ok) {
        if (r.code === 'NO_TEXT_LAYERS') U.toast('warn', 'Select text layers first');
        else if (r.code === 'PLUGIN_MISSING') { (r.missing || []).forEach(function (n) { CQ.app.plugins[n] = false; }); pluginDialog(p, r.missing || []); renderCards(); }
        else if (r.code === 'NO_COMP') U.toast('warn', 'Open a composition first');
        else { CQ.services.Log.error(null, 'apply ' + p.id + ' ' + r.code + ' ' + r.message); U.dialog({ kind: 'err', title: 'Could not apply the preset', text: 'Nothing was changed. Try again.' }); }
        return;
      }
      var ok = r.results.filter(function (x) { return x.ok; }).length, failed = r.results.length - ok;
      var notes = [];
      r.results.forEach(function (x) { (x.warnings || []).forEach(function (w) { notes.push(w); }); if (!x.ok) notes.push(x.name + ': ' + x.error); });
      if (notes.length) CQ.services.Log.warn(null, 'apply ' + p.id + ' notes: ' + notes.join(' | '));
      if (failed) U.dialog({ kind: 'warn', title: 'Applied to ' + ok + ' of ' + r.results.length + ' layers', text: 'Some layers are locked or are not text layers.' });
      else U.toast('ok', p.name + ' applied', ok > 1 ? ok + ' layers' : '');
      if (notes.some(function (w) { return w.indexOf('FONT_MISSING') === 0; })) CQ.app.fontMissing();
    }, function () { V.apply.setBusy(false); U.dialog({ kind: 'err', title: 'After Effects is busy', text: 'Wait a moment and try again.' }); });
  }

  function removePreset() {
    CQ.host.call('removePreset').then(function (r) {
      if (r.ok && r.cleared) U.toast('ok', 'Animation removed', r.cleared > 1 ? r.cleared + ' layers' : '');
      else U.toast('warn', 'Select animated text layers first');
    });
  }

  function build(rootEl) {
    var search = el('input', { class: 'input', placeholder: 'Search 65 presets' });
    search.addEventListener('input', function () { S.q = search.value; clearTimeout(search._t); search._t = setTimeout(renderCards, 150); });
    var sizeBtn = U.iconBtn(S.big ? 'grid' : 'gridBig', 'Card size', function () { S.big = !S.big; U.store.set('animBig', S.big); sizeBtn.innerHTML = CQ.icons[S.big ? 'grid' : 'gridBig']; renderCards(); });
    var chips = el('div', { class: 'chips' });
    CQ.presets.CATEGORIES.forEach(function (c) {
      var b = el('button', { class: 'chip' + (S.cat === c ? ' active' : ''), text: c });
      b.addEventListener('click', function () { S.cat = c; U.store.set('animCat', c); U.$$('.chip', chips).forEach(function (x) { x.classList.toggle('active', x === b); }); renderCards(); });
      chips.appendChild(b);
    });
    V.cards = el('div', { class: 'cards' });
    for (var i = 0; i < 12; i++) V.cards.appendChild(el('div', { class: 'card skeleton', style: { paddingTop: '56.25%' } }));
    V.name = el('b'); V.sub = el('small');
    V.optBtn = U.iconBtn('sliders', 'Options', optionsPop);
    V.apply = U.btn('Apply', { cls: 'primary', icon: 'check', onClick: apply });
    rootEl.appendChild(el('div', { class: 'scroll' }, [
      el('div', { class: 'atool' }, [el('div', { class: 'search' }, [U.svg('search'), search]), sizeBtn]),
      chips, V.cards
    ]));
    rootEl.appendChild(el('div', { class: 'foot' }, [
      el('div', { class: 'info' }, [V.name, V.sub]),
      U.iconBtn('trash', 'Remove CyriqCap animation from the selected layers', removePreset),
      V.optBtn, V.apply
    ]));
    var sid = U.store.get('animSel', null);
    S.selected = (sid && CQ.presets.byId(sid)) || CQ.presets.list[0];
    updateFoot();
  }

  function onSelection(sel) {
    S.textLayers = sel && sel.layers ? sel.layers.filter(function (l) { return l.kind === 'text'; }).length : 0;
    if (V.apply) updateFoot();
  }

  CQ.animate = {
    build: build, onSelection: onSelection, pluginDialog: pluginDialog, pluginModal: pluginDialog, refresh: renderCards, state: S,
    ready: renderCards
  };
})(typeof window !== 'undefined' ? window : global);

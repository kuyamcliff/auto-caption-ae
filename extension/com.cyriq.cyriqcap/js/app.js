/* CyriqCap panel bootstrap. */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui;

  var app = CQ.app = {
    version: '1.0.0',
    apiDir: U.store.get('apiDir', ''),
    api: null,
    plugins: {},
    selection: null,
    aeFonts: [],
    aeVersion: null,
    _busy: false
  };

  /* ---------------------------------------------------------- responsive scale */
  function rescale() {
    var w = root.innerWidth, h = root.innerHeight;
    var fs = Math.max(11, Math.min(15.5, Math.min(w / 27, h / 34)));
    document.documentElement.style.fontSize = fs.toFixed(2) + 'px';
    document.body.classList.toggle('narrow', w < 360);
    moveInk();
  }

  /* ---------------------------------------------------------- tabs */
  var current = 'captions';
  function moveInk() {
    var tabs = U.$$('#tabs button'), ink = U.$('#tabInk'), i = 0;
    tabs.forEach(function (b, k) { if (b.dataset.tab === current) i = k; });
    var b = tabs[i];
    if (!b) return;
    ink.style.width = b.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + b.offsetLeft + 'px)';
  }
  app.go = function (tab) {
    current = tab;
    U.$$('#tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    U.$$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + tab); });
    U.store.set('tab', tab);
    moveInk();
    if (tab === 'help' && CQ.help) CQ.help.onShow();
  };

  /* ---------------------------------------------------------- API folder */
  function setPill() {
    var a = app.api, dot = U.$('#apiDot'), txt = U.$('#apiText');
    if (app._busy) { dot.className = 'dot busy'; txt.textContent = 'Working'; return; }
    if (!a) { dot.className = 'dot err'; txt.textContent = 'No API'; return; }
    if (a.ok) { dot.className = 'dot ok'; txt.textContent = 'Offline ready'; return; }
    if (a.engines.whispercpp || a.engines.whisperx) { dot.className = 'dot warn'; txt.textContent = 'API incomplete'; return; }
    dot.className = 'dot err'; txt.textContent = 'API problem';
  }
  app.busy = function (b) { app._busy = b; setPill(); };

  app.verifyApi = function (dir, deep, onProgress) {
    var cacheKey = 'apiCheck';
    if (!CQ.services.hasNode) {
      return CQ.mockHost.verifyApi(dir).then(function (r) { app.api = r; app.apiDir = dir; U.store.set('apiDir', dir); setPill(); CQ.settings.renderApi(); if (CQ.captionsView) CQ.captionsView.onEngines(r.engines); return r; });
    }
    return CQ.services.Api.verify(dir, { deep: deep, onProgress: onProgress }).then(function (r) {
      app.api = r;
      if (r.engines.whispercpp || r.engines.whisperx) { app.apiDir = dir; U.store.set('apiDir', dir); if (deep) U.store.set(cacheKey, { dir: dir, version: r.version, ok: r.ok, at: Date.now() }); }
      setPill();
      CQ.settings.renderApi();
      if (CQ.captionsView) CQ.captionsView.onEngines(r.engines);
      CQ.services.Log.info(null, 'api check deep=' + !!deep + ' ok=' + r.ok + ' missing=' + r.missing.length + ' wrongSize=' + r.wrongSize.length + ' badHash=' + r.badHash.length);
      return r;
    });
  };
  app.setApiDir = function (dir) { return app.verifyApi(dir, true); };

  /* ---------------------------------------------------------- plug-ins & fonts */
  app.scanPlugins = function (force) {
    var P = CQ.presets.PLUGINS, req = {};
    Object.keys(P).forEach(function (k) { req[k] = P[k].match; });
    var cached = U.store.get('plugins', null);
    if (cached && !force && Date.now() - cached.at < 864e5 && cached.ae === app.aeVersion) { app.plugins = cached.found; return Promise.resolve(app.plugins); }
    return CQ.host.call('checkPlugins', { plugins: req }).then(function (r) {
      if (r.ok) { app.plugins = r.found; U.store.set('plugins', { found: r.found, at: Date.now(), ae: app.aeVersion }); }
      if (CQ.settings) CQ.settings.renderPlugins();
      return app.plugins;
    }, function () { return app.plugins; });
  };

  app.fontMissing = function (fonts) {
    var uniq = fonts.filter(function (f, i) { return fonts.indexOf(f) === i; });
    U.modal({
      kind: 'warn', icon: 'font', title: 'Font not available in After Effects',
      text: 'After Effects used a substitute for:', list: uniq,
      actions: [{ label: 'Close' }, { label: 'Install Fonts', primary: true, onClick: function () { app.go('settings'); } }]
    });
  };

  /* ---------------------------------------------------------- selection polling */
  var lastSel = '';
  function poll() {
    CQ.host.call('getSelection').then(function (r) {
      if (!r.ok) return;
      var key = JSON.stringify([r.comp && r.comp.id, (r.layers || []).map(function (l) { return [l.index, l.name, l.kind, l.inPoint, l.outPoint]; })]);
      app.aeVersion = r.aeVersion || app.aeVersion;
      if (key === lastSel) return;
      lastSel = key;
      app.selection = r;
      CQ.captionsView.onSelection(r);
      CQ.animate.onSelection(r);
    }).catch(function () {}).then(function () { setTimeout(poll, document.hidden ? 2000 : 700); });
  }

  /* ---------------------------------------------------------- init */
  function init() {
    U.$('#brandMark').innerHTML = CQ.icons.mark;
    U.$$('[data-icon]').forEach(function (i) { i.outerHTML = CQ.icons[i.getAttribute('data-icon')]; });
    U.$$('#tabs button').forEach(function (b) { b.addEventListener('click', function () { app.go(b.dataset.tab); }); });
    U.$('#apiPill').addEventListener('click', function () { app.go('settings'); });
    root.addEventListener('resize', function () { clearTimeout(rescale._t); rescale._t = setTimeout(rescale, 30); });
    rescale();

    if (CQ.services.hasNode) { try { CQ.services.Temp.sweep(); } catch (e) {} }

    CQ.captionsView.build(U.$('#view-captions'));
    CQ.animate.build(U.$('#view-animate'));
    CQ.help.build(U.$('#view-help'));
    CQ.settings.build(U.$('#view-settings'));
    app.go(U.store.get('tab', 'captions'));
    setPill();

    // fonts first, so previews render with the right typefaces
    var fams = Object.keys(CQ.presets.FONTS).map(function (k) { return document.fonts.load('40px "' + CQ.presets.FONTS[k].css + '"'); });
    Promise.all(fams).catch(function () {}).then(function () { CQ.animate.ready(); });

    CQ.host.loadHostScript().then(function () { return CQ.host.call('ping'); }).then(function (r) {
      app.aeVersion = r.ae;
      CQ.services.Log.info(null, 'panel start v' + app.version + ' ae=' + r.ae + ' os=' + r.os);
      poll();
      app.scanPlugins(false).then(function () { CQ.animate.refresh(); });
      return CQ.host.call('listFonts');
    }).then(function (f) {
      if (f && f.supported) { app.aeFonts = f.fonts; CQ.captionsView.onFonts(); }
    }).catch(function (e) {
      U.toast('err', 'After Effects connection', e.message);
    });

    // API folder: quick check every launch, full (hash) check on first setup
    var first = !app.apiDir;
    var p = app.apiDir ? app.verifyApi(app.apiDir, false) : Promise.resolve(null);
    p.then(function (r) {
      if (first || !r || !(r.engines.whispercpp || r.engines.whisperx)) return CQ.settings.onboarding();
      if (!r.ok) U.toast('warn', 'API folder incomplete', 'Open Settings for details.');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : global);

/* CyriqCap panel bootstrap. */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui;

  var app = CQ.app = {
    version: '1.1.0',
    apiDir: U.store.get('apiDir', ''),
    api: null,
    plugins: {},
    selection: null,
    aeFonts: [],
    aeVersion: null,
    modelStatus: [],
    pythonOk: null,      // null = not tested yet
    lastTab: 'captions',
    _busy: false
  };

  /* ---------------------------------------------------------- theme: follow the After Effects panel colour */
  function theme() {
    var hex = CQ.host.skin && CQ.host.skin();
    if (!hex) return;
    var n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    if ((r + g + b) / 3 > 110) return;   // very light AE themes: keep the default dark grey
    function sh(d) { var f = function (v) { v = Math.max(0, Math.min(255, v + d)); return (v < 16 ? '0' : '') + v.toString(16); }; return '#' + f(r) + f(g) + f(b); }
    var s = document.documentElement.style;
    s.setProperty('--bg', hex); s.setProperty('--sunk', sh(-8)); s.setProperty('--raise', sh(8));
    s.setProperty('--hover', sh(16)); s.setProperty('--line', sh(21)); s.setProperty('--line2', sh(36));
  }

  /* ---------------------------------------------------------- views */
  app.go = function (tab) {
    if (tab !== 'settings') app.lastTab = tab;
    U.$$('#tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    U.$('#gear').classList.toggle('on', tab === 'settings');
    U.$$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + tab); });
    if (tab !== 'settings') U.store.set('tab', tab);
    U.closePop();
  };

  /* ---------------------------------------------------------- API folder */
  function usable(a) { return !!(a && a.engines && (a.engines.whispercpp || a.engines.whisperx)); }
  function badge() { U.$('#gearBadge').classList.toggle('hidden', usable(app.api)); }
  app.busy = function (b) { app._busy = b; };

  /** True when captions can be generated; otherwise offers setup. */
  app.apiReady = function () {
    if (usable(app.api)) return true;
    U.dialog({
      kind: 'warn', icon: 'folder', title: 'Choose the API folder',
      text: 'CyriqCap needs the CyriqCap-API folder from your download to make captions.',
      actions: [{ label: 'Cancel' }, { label: 'Choose Folder', primary: true, onClick: function () { CQ.settings.setup(); } }]
    });
    return false;
  };

  /** Instant check: about 40 key files by size. */
  app.verifyApi = function (dir) {
    var r;
    if (CQ.services.hasNode) {
      dir = CQ.services.Api.resolve(dir);
      try { r = CQ.services.Api.quick(dir); } catch (e) { r = { ok: false, dir: dir, engines: {}, missing: [], problems: ['CHECK_FAILED'] }; }
      CQ.services.Log.info(null, 'api quick ok=' + r.ok + ' wc=' + r.engines.whispercpp + ' wx=' + r.engines.whisperx + ' missing=' + (r.missing || []).length + ' ' + r.problems.join(','));
    } else r = CQ.mockHost.verifyApi(dir);
    app.api = r;
    if (usable(r)) {
      if (app.apiDir !== dir) app.pythonOk = null;
      app.apiDir = dir; U.store.set('apiDir', dir);
      CQ.modelsUI.refresh();
      testPython();
    }
    badge();
    CQ.settings.renderApi();
    return Promise.resolve(r);
  };

  /** Start the WhisperX runtime once in the background (result cached per folder). */
  function testPython() {
    if (!CQ.services.hasNode || !app.api || !app.api.engines.whisperx) { if (app.api && !app.api.engines.whisperx) app.pythonOk = false; return; }
    var cache = U.store.get('pyTest', null);
    if (cache && cache.dir === app.apiDir && cache.v === app.version && (cache.ok || Date.now() - cache.at < 864e5)) { app.pythonOk = cache.ok; return; }
    CQ.services.Api.testPython(app.apiDir).then(function (r) {
      app.pythonOk = r.ok;
      U.store.set('pyTest', { dir: app.apiDir, ok: r.ok, at: Date.now(), v: app.version });
    });
  }

  /* ---------------------------------------------------------- plug-ins & fonts */
  app.scanPlugins = function (force) {
    var P = CQ.presets.PLUGINS, req = {};
    Object.keys(P).forEach(function (k) { req[k] = P[k].match; });
    var cached = U.store.get('plugins', null);
    if (cached && !force && Date.now() - cached.at < 864e5 && cached.ae === app.aeVersion) { app.plugins = cached.found; return Promise.resolve(app.plugins); }
    return CQ.host.call('checkPlugins', { plugins: req }).then(function (r) {
      if (r.ok) { app.plugins = r.found; U.store.set('plugins', { found: r.found, at: Date.now(), ae: app.aeVersion }); }
      CQ.settings.renderPlugins();
      return app.plugins;
    }, function () { return app.plugins; });
  };

  app.fontMissing = function () {
    U.dialog({
      kind: 'warn', icon: 'font', title: 'Font not found in After Effects',
      text: 'After Effects used a replacement font. Install the CyriqCap fonts in Settings, then restart After Effects.',
      actions: [{ label: 'Close' }, { label: 'Open Settings', primary: true, onClick: function () { app.go('settings'); } }]
    });
  };

  /* ---------------------------------------------------------- selection polling */
  var lastSel = '';
  function poll() {
    CQ.host.call('getSelection').then(function (r) {
      if (!r.ok) return;
      var key = JSON.stringify([r.comp && [r.comp.id, r.comp.width, r.comp.height], (r.layers || []).map(function (l) { return [l.index, l.name, l.kind, l.inPoint, l.outPoint]; })]);
      app.aeVersion = r.aeVersion || app.aeVersion;
      if (key === lastSel) return;
      lastSel = key;
      app.selection = r;
      CQ.captionsView.onSelection(r);
      CQ.animate.onSelection(r);
    }).catch(function () {}).then(function () { setTimeout(poll, document.hidden ? 2000 : 600); });
  }

  /* ---------------------------------------------------------- init */
  function init() {
    theme();
    CQ.host.onThemeChange(theme);
    U.$$('[data-icon]').forEach(function (i) { i.outerHTML = CQ.icons[i.getAttribute('data-icon')]; });
    U.$$('#tabs button').forEach(function (b) { b.addEventListener('click', function () { app.go(b.dataset.tab); }); });
    U.$('#gear').addEventListener('click', function () { app.go(U.$('#view-settings').classList.contains('active') ? app.lastTab : 'settings'); });

    if (CQ.services.hasNode) {
      try { CQ.services.setExtensionDir(CQ.host.extensionPath()); } catch (e) {}
      try { CQ.services.Temp.sweep(); } catch (e) {}
    }

    CQ.captionsView.build(U.$('#view-captions'));
    CQ.animate.build(U.$('#view-animate'));
    CQ.help.build(U.$('#view-help'));
    CQ.settings.build(U.$('#view-settings'));
    app.go(U.store.get('tab', 'captions'));

    // previews start once the fonts are loaded so the first frame is right
    var fams = Object.keys(CQ.presets.FONTS).map(function (k) { return document.fonts.load('40px "' + CQ.presets.FONTS[k].css + '"'); });
    Promise.all(fams).catch(function () {}).then(function () { CQ.animate.ready(); });

    CQ.host.loadHostScript().then(function () { return CQ.host.call('ping'); }).then(function (r) {
      app.aeVersion = r.ae;
      if (CQ.services.hasNode) CQ.services.Log.info(null, 'panel start v' + app.version + ' ae=' + r.ae + ' os=' + r.os);
      poll();
      app.scanPlugins(false).then(function () { CQ.animate.refresh(); });
      return CQ.host.call('listFonts');
    }).then(function (f) {
      if (f && f.supported) { app.aeFonts = f.fonts; CQ.captionsView.onFonts(); }
    }).catch(function (e) {
      if (CQ.services.hasNode) CQ.services.Log.error(null, 'host start ' + (e && e.message));
      U.toast('err', 'Could not connect to After Effects', 'Reopen the panel');
    });

    // API folder: instant check; setup screen only when it is missing or unusable
    if (!app.apiDir) { badge(); CQ.settings.setup(); return; }
    app.verifyApi(app.apiDir).then(function (r) { if (!usable(r)) CQ.settings.setup(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : global);

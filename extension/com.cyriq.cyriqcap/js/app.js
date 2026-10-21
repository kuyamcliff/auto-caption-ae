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
    modelStatus: [],
    _busy: false
  };

  /* ---------------------------------------------------------- scale */
  function rescale() {
    var w = root.innerWidth;
    var fs = Math.max(11, Math.min(13, w / 30));
    document.documentElement.style.fontSize = fs.toFixed(2) + 'px';
    document.body.classList.toggle('narrow', w < 330);
  }

  /* ---------------------------------------------------------- tabs */
  app.go = function (tab) {
    U.$$('#tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    U.$$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + tab); });
    U.store.set('tab', tab);
    if (tab === 'help' && CQ.help) CQ.help.onShow();
  };

  /* ---------------------------------------------------------- API folder */
  function usable(a) { return !!(a && a.engines && (a.engines.whispercpp || a.engines.whisperx)); }
  function setPill() {
    var a = app.api, dot = U.$('#apiDot'), txt = U.$('#apiText');
    if (app._busy) { dot.className = 'dot busy'; txt.textContent = 'Working'; return; }
    if (!a) { dot.className = 'dot err'; txt.textContent = app.apiDir ? 'Checking' : 'Not set up'; if (app.apiDir) dot.className = 'dot busy'; return; }
    if (a.ok) { dot.className = 'dot ok'; txt.textContent = 'Ready'; return; }
    if (usable(a)) { dot.className = 'dot warn'; txt.textContent = 'Files missing'; return; }
    dot.className = 'dot err'; txt.textContent = 'Not set up';
  }
  app.busy = function (b) { app._busy = b; setPill(); };

  /** True when captions can be generated. Otherwise explains and offers setup. */
  app.apiReady = function () {
    if (usable(app.api)) return true;
    U.dialog({
      kind: 'warn', icon: 'folder', title: 'Set up the API folder',
      text: app.apiDir ? 'Some required files are missing from the API folder. Check the folder or choose another one.' : 'Choose the CyriqCap-API folder before generating captions.',
      actions: [{ label: 'Cancel' }, { label: 'Set Up', primary: true, onClick: function () { CQ.settings.setup(); } }]
    });
    return false;
  };

  app.verifyApi = function (dir, deep, onProgress, onFile, onFail) {
    var p = CQ.services.hasNode
      ? CQ.services.Api.verify(dir, { deep: deep, onProgress: onProgress, onFile: onFile, onFail: onFail })
      : CQ.mockHost.verifyApi(dir, { onFile: onFile, onFail: onFail });
    return p.then(function (r) {
      app.api = r;
      if (usable(r)) { app.apiDir = dir; U.store.set('apiDir', dir); }
      setPill();
      CQ.settings.renderApi();
      if (CQ.modelsUI) CQ.modelsUI.refresh();
      if (CQ.services.hasNode) CQ.services.Log.info(null, 'api check deep=' + !!deep + ' ok=' + r.ok + ' missing=' + r.missing.length + ' wrongSize=' + r.wrongSize.length + ' badHash=' + r.badHash.length + ' problems=' + r.problems.join(','));
      return r;
    }, function (e) {
      if (CQ.services.hasNode) CQ.services.Log.error(null, 'api check failed ' + (e && e.message));
      var r = { ok: false, dir: dir, missing: [], wrongSize: [], badHash: [], groups: {}, engines: {}, problems: ['CHECK_FAILED'] };
      app.api = r; setPill();
      return r;
    });
  };

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
      if (CQ.services.hasNode) CQ.services.Log.info(null, 'panel start v' + app.version + ' ae=' + r.ae + ' os=' + r.os);
      poll();
      app.scanPlugins(false).then(function () { CQ.animate.refresh(); });
      return CQ.host.call('listFonts');
    }).then(function (f) {
      if (f && f.supported) { app.aeFonts = f.fonts; CQ.captionsView.onFonts(); }
    }).catch(function (e) {
      if (CQ.services.hasNode) CQ.services.Log.error(null, 'host start ' + (e && e.message));
      U.toast('err', 'Could not connect to After Effects', 'Close and reopen the panel.');
    });

    // API folder: quick check on every launch; setup screen when missing or unusable
    if (!app.apiDir) { CQ.settings.setup(); return; }
    app.verifyApi(app.apiDir, false).then(function (r) {
      if (!usable(r)) return CQ.settings.setup();
      if (!r.ok) U.toast('warn', 'Some files are missing', 'Open Settings › Check Files.');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : global);

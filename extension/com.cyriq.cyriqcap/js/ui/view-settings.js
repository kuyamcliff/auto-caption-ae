/* Settings tab + setup screen (API folder, file-by-file check). */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui, el = U.el;
  var V = {};

  var GROUPS = [
    ['ffmpeg', 'Audio tools'],
    ['whispercpp', 'Speech engine'],
    ['model-ggml-small', 'Speech model'],
    ['python', 'Runtime'],
    ['whisperx', 'Word timing engine'],
    ['model-faster-whisper-small', 'Speech model, precise'],
    ['model-align-en', 'Word alignment'],
    ['data', 'Language data'],
    ['docs', 'Licenses']
  ];

  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /**
   * File check UI. Returns {el, run(dir) -> Promise<result>}.
   * Shows every file being checked, a per-group status and the totals.
   */
  function fileCheck() {
    var rows = {}, list = el('div', { class: 'fc' });
    GROUPS.forEach(function (g) {
      var st = el('span', { class: 'st', html: CQ.icons.stop });
      var c = el('span', { class: 'c' });
      var r = el('div', { class: 'g' }, [st, el('span', { class: 'n', text: g[1] }), c]);
      rows[g[0]] = { row: r, st: st, c: c, done: 0, total: 0, bad: 0 };
      list.appendChild(r);
    });
    var count = el('div', { class: 'fcount' }, [el('span', { text: 'Checking files' }), el('span', { text: '' })]);
    var bar = el('div', { class: 'bar' }, [el('i')]);
    var cur = el('div', { class: 'fcur mono' });
    var missing = el('div', { class: 'fmissing hidden' });
    var box = el('div', null, [count, bar, cur, list, missing]);

    function setRow(g, state) {
      var r = rows[g]; if (!r) return;
      r.row.className = 'g ' + state;
      r.st.innerHTML = CQ.icons[state === 'run' ? 'spin' : state === 'ok' ? 'ok' : state === 'bad' ? 'bad' : 'stop'];
    }

    function run(dir) {
      missing.classList.add('hidden'); missing.innerHTML = '';
      Object.keys(rows).forEach(function (g) { rows[g].done = 0; rows[g].bad = 0; rows[g].total = 0; rows[g].c.textContent = ''; setRow(g, ''); });
      count.firstChild.textContent = 'Checking files';
      var m = CQ.services.hasNode ? CQ.services.Api.readManifest(dir) : CQ.mockHost.manifest();
      if (m && m.files) m.files.forEach(function (f) { if (rows[f.group]) rows[f.group].total++; });
      var lastG = null, bad = [];
      var started = Date.now();
      function onFile(i, total, p, g) {
        if (g !== lastG) { if (lastG && rows[lastG]) setRow(lastG, rows[lastG].bad ? 'bad' : 'ok'); setRow(g, 'run'); lastG = g; }
        var r = rows[g];
        if (r) { r.done++; r.c.textContent = fmt(r.done) + ' / ' + fmt(r.total); }
        if (i % 7 === 0 || i === total) { count.lastChild.textContent = fmt(i) + ' / ' + fmt(total); cur.textContent = p; bar.firstChild.style.width = (i / total * 100).toFixed(1) + '%'; }
      }
      function onFail(p, g) { if (rows[g]) rows[g].bad++; bad.push(p); }
      return CQ.app.verifyApi(dir, true, null, onFile, onFail).then(function (res) {
        if (lastG && rows[lastG]) setRow(lastG, rows[lastG].bad ? 'bad' : 'ok');
        Object.keys(rows).forEach(function (g) {
          var info = res.groups ? res.groups[g] : null;
          if (!info) { setRow(g, 'bad'); rows[g].c.textContent = 'missing'; }
          else setRow(g, info.ok ? 'ok' : 'bad');
        });
        bar.firstChild.style.width = '100%';
        var n = (res.missing || []).length + (res.wrongSize || []).length + (res.badHash || []).length;
        var total = m && m.files ? m.files.length : 0;
        cur.textContent = '';
        if (res.problems.indexOf('NOT_API_FOLDER') >= 0 || res.problems.indexOf('FOLDER_NOT_FOUND') >= 0) count.firstChild.textContent = 'This is not a CyriqCap API folder';
        else if (res.problems.indexOf('MANIFEST_DAMAGED') >= 0) count.firstChild.textContent = 'The API folder is damaged';
        else if (n) {
          count.firstChild.textContent = fmt(n) + ' file' + (n > 1 ? 's' : '') + ' missing or damaged';
          missing.classList.remove('hidden');
          (res.missing || []).concat(res.wrongSize || [], res.badHash || []).slice(0, 30).forEach(function (p) { missing.appendChild(el('div', { text: p })); });
        } else count.firstChild.textContent = 'All ' + fmt(total) + ' files verified';
        count.lastChild.textContent = ((Date.now() - started) / 1000).toFixed(1) + ' s';
        return res;
      });
    }
    return { el: box, run: run };
  }

  /* ---------------------------------------------------------- setup screen */
  function setup() {
    return new Promise(function (resolve) {
      var dir = CQ.app.apiDir || '';
      var check = fileCheck();
      var checkWrap = el('div', { class: 'hidden' }, [check.el]);
      var pathEl = el('div', { class: 'pathline hidden' });
      var choose = U.btn('Choose API Folder', { cls: 'primary block', icon: 'folder' });
      var cont = U.btn('Continue', { cls: 'primary block hidden' });
      var again = el('button', { class: 'link hidden', text: 'Choose a different folder', style: { marginTop: '.6rem' } });
      var box = el('div', { class: 'box' }, [
        el('div', { class: 'hd' }, [el('span', { class: 'mark', html: CQ.icons.mark }), el('div', null, [el('b', { text: 'Set up CyriqCap' }), el('small', { text: 'Select the CyriqCap-API folder you unzipped.' })])]),
        pathEl, checkWrap, choose, cont, again
      ]);
      var ov = el('div', { id: 'setup' }, [box]);
      document.body.appendChild(ov);
      function start(d) {
        dir = d; pathEl.textContent = d; pathEl.classList.remove('hidden'); checkWrap.classList.remove('hidden');
        choose.classList.add('hidden'); cont.classList.add('hidden'); again.classList.add('hidden');
        check.run(d).then(function (res) {
          var usable = res.engines && (res.engines.whispercpp || res.engines.whisperx);
          if (usable) cont.classList.remove('hidden');
          else { choose.classList.remove('hidden'); choose.lastChild.textContent = 'Choose Another Folder'; }
          if (usable) again.classList.remove('hidden');
        });
      }
      function pick() { CQ.host.chooseFolder('Select the CyriqCap-API folder', dir).then(function (d) { if (d) start(d); }); }
      choose.addEventListener('click', pick);
      again.addEventListener('click', pick);
      cont.addEventListener('click', function () { if (ov.parentNode) ov.parentNode.removeChild(ov); CQ.modelsUI.refresh(); resolve(); });
      if (dir) start(dir);
    });
  }

  /* ---------------------------------------------------------- settings view */
  function renderFonts() {
    V.fonts.innerHTML = '';
    var st = [];
    if (CQ.services.hasNode) { try { st = CQ.services.Fonts.status(CQ.host.extensionPath()); } catch (e) { st = []; } }
    else st = Object.keys(CQ.presets.FONTS).map(function (k) { return { file: CQ.presets.FONTS[k].file, installed: true }; });
    var n = 0;
    st.forEach(function (f) { if (f.installed) n++; V.fonts.appendChild(el('div', { class: f.installed ? 'on' : '' }, [U.svg(f.installed ? 'check' : 'stop'), f.file.replace(/\.(ttf|otf)$/i, '').replace(/-/g, ' ')])); });
    V.fontState.textContent = n + ' of ' + st.length + ' installed';
  }

  function installFonts() {
    if (!CQ.services.hasNode) return;
    V.fontBtn.setBusy(true);
    CQ.services.Fonts.install(CQ.host.extensionPath()).then(function (r) {
      V.fontBtn.setBusy(false); renderFonts();
      if (r.failed.length) U.dialog({ kind: 'warn', title: 'Some fonts could not be installed', text: 'Close After Effects, then install them again.' });
      else U.dialog({ title: 'Fonts installed', icon: 'check', text: 'Restart After Effects once so the fonts appear in the Character panel and in presets.' });
    }, function () { V.fontBtn.setBusy(false); U.dialog({ kind: 'err', title: 'Fonts could not be installed', text: 'Close After Effects, then try again.' }); });
  }

  function renderApi() {
    if (!V.path) return;
    V.path.textContent = CQ.app.apiDir || 'Not set';
    var a = CQ.app.api;
    V.apiState.textContent = !a ? '' : a.ok ? 'All files verified' : (a.engines && (a.engines.whispercpp || a.engines.whisperx)) ? 'Some files are missing' : 'Not usable';
  }

  function renderPlugins() {
    if (!V.plugs) return;
    V.plugs.innerHTML = '';
    Object.keys(CQ.presets.PLUGINS).forEach(function (k) {
      var pl = CQ.presets.PLUGINS[k], ok = CQ.app.plugins[k];
      V.plugs.appendChild(el('div', { class: 'kv' }, [el('span', { class: 'k', text: pl.name }), el('span', { class: 'v', style: { color: ok ? 'var(--ok)' : 'var(--dim)' }, text: ok ? 'Installed' : 'Not found' })]));
    });
  }

  function openCheck() {
    var c = fileCheck();
    U.dialog({ title: 'Check files', icon: 'filecheck', body: el('div', { style: { marginTop: '.6rem' } }, [c.el]), wide: true, actions: [{ label: 'Close', primary: true }] });
    c.run(CQ.app.apiDir).then(function () { renderApi(); });
  }

  function build(rootEl) {
    V.path = el('div', { class: 'pathline' });
    V.apiState = el('span', { class: 'tag' });
    V.fonts = el('div', { class: 'fonts' });
    V.fontState = el('span', { class: 'tag' });
    V.fontBtn = U.btn('Install Fonts', { icon: 'font', onClick: installFonts });
    V.plugs = el('div');
    rootEl.appendChild(el('div', { class: 'section' }, [
      el('div', { class: 'title' }, ['API folder', el('span', { class: 'spacer' }), V.apiState]),
      V.path,
      el('div', { class: 'line' }, [
        U.btn('Change', { icon: 'folder', onClick: function () { CQ.host.chooseFolder('Select the CyriqCap-API folder', CQ.app.apiDir).then(function (d) { if (d) { CQ.app.apiDir = d; setup(); } }); } }),
        U.btn('Check Files', { icon: 'filecheck', onClick: openCheck })
      ])
    ]));
    rootEl.appendChild(el('div', { class: 'section' }, [el('div', { class: 'title', text: 'Models' }), CQ.modelsUI.section()]));
    rootEl.appendChild(el('div', { class: 'section' }, [el('div', { class: 'title' }, ['Fonts', el('span', { class: 'spacer' }), V.fontState]), V.fontBtn, V.fonts]));
    rootEl.appendChild(el('div', { class: 'section' }, [el('div', { class: 'title' }, ['Plug-ins', el('span', { class: 'spacer' }), el('button', { class: 'link', text: 'Scan again', onclick: function () { CQ.app.scanPlugins(true).then(function () { renderPlugins(); CQ.animate.refresh(); }); } })]), V.plugs]));
    rootEl.appendChild(el('div', { class: 'section' }, [el('div', { class: 'title', text: 'About' }),
      el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Version' }), el('span', { class: 'v', text: CQ.app.version })]),
      el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Logs' }), el('span', { class: 'v' }, [el('button', { class: 'link', text: 'Open folder', onclick: function () { CQ.host.openFolder(CQ.services.Log.dir()); } })])]),
      el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Licenses' }), el('span', { class: 'v' }, [el('button', { class: 'link', text: 'Open folder', onclick: function () { CQ.host.openFolder(require('path').join(CQ.host.extensionPath(), 'licenses')); } })])])
    ]));
    renderApi(); renderFonts(); renderPlugins();
  }

  CQ.settings = { build: build, setup: setup, onboarding: setup, renderApi: renderApi, renderPlugins: renderPlugins, renderFonts: function () { if (V.fonts) renderFonts(); } };
})(typeof window !== 'undefined' ? window : global);

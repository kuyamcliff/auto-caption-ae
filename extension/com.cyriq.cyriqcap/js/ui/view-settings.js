/* Settings tab + first-run onboarding (API folder). */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui, el = U.el;
  var V = {};

  var GROUP_NAMES = [
    ['ffmpeg', 'Audio converter'],
    ['whispercpp', 'Whisper.cpp engine'],
    ['model-ggml-small', 'Whisper Small model'],
    ['python', 'Python runtime'],
    ['whisperx', 'WhisperX engine'],
    ['model-faster-whisper-small', 'WhisperX Small model'],
    ['model-align-en', 'Word alignment (English)'],
    ['data', 'Language data']
  ];

  function fmtBytes(n) { if (n > 1e9) return (n / 1e9).toFixed(2) + ' GB'; if (n > 1e6) return (n / 1e6).toFixed(0) + ' MB'; return Math.round(n / 1e3) + ' KB'; }

  function checkRows(res, container) {
    container.innerHTML = '';
    GROUP_NAMES.forEach(function (g, i) {
      var info = res && res.groups ? res.groups[g[0]] : null;
      var cls = 'check', st;
      if (!res) { st = el('span', { class: 'spin' }); }
      else if (info && info.ok) { cls += ' ok'; st = el('span', { html: CQ.icons.check }); }
      else { cls += ' bad'; st = el('span', { html: CQ.icons.x }); }
      var row = el('div', { class: cls }, [el('span', { class: 'st' }, [st]), el('span', { class: 'nm', text: g[1] }), el('span', { class: 'val', text: info ? info.files + ' file' + (info.files > 1 ? 's' : '') : (res ? 'missing' : '') })]);
      row.style.animationDelay = i * 0.05 + 's';
      container.appendChild(row);
    });
  }

  function problemText(res) {
    if (!res) return '';
    if (res.problems.indexOf('FOLDER_NOT_FOUND') >= 0) return 'Folder not found.';
    if (res.problems.indexOf('NOT_API_FOLDER') >= 0) return 'This is not a CyriqCap API folder (cyriqcap-api.json is missing).';
    if (res.problems.indexOf('MANIFEST_DAMAGED') >= 0) return 'The API folder manifest is damaged.';
    var n = res.missing.length + res.wrongSize.length + res.badHash.length;
    if (n) return n + ' file' + (n > 1 ? 's are' : ' is') + ' missing or damaged.';
    return '';
  }

  /* ---------------------------------------------------------- onboarding */
  function onboarding() {
    return new Promise(function (resolve) {
      var path = CQ.app.apiDir || '';
      var checks = el('div', { class: 'checks hidden' });
      var pathBox = el('div', { class: 'path-box hidden' });
      var msg = el('div', { class: 'sub hidden', style: { color: 'var(--err)' } });
      var choose = el('button', { class: 'btn primary block' }, [U.icon('folder'), 'Choose API Folder']);
      var cont = el('button', { class: 'btn block hidden', style: { marginTop: '.5rem' } }, ['Continue']);
      var bar = el('div', { class: 'bar hidden', style: { marginBottom: '.6rem' } }, [el('i')]);
      var box = el('div', { class: 'box' }, [
        el('div', { class: 'logo', html: CQ.icons.mark }),
        el('h1', null, ['Cyriq', el('b', { text: 'Cap' })]),
        el('div', { class: 'sub', text: 'Auto captions & text animation' }),
        pathBox, bar, checks, msg, choose, cont
      ]);
      var ov = el('div', { id: 'onboard' }, [box]);
      document.body.appendChild(ov);

      function run(dir) {
        pathBox.textContent = dir; pathBox.classList.remove('hidden');
        checks.classList.remove('hidden'); checkRows(null, checks);
        msg.classList.add('hidden'); cont.classList.add('hidden');
        choose.classList.add('loading');
        bar.classList.remove('hidden');
        CQ.app.verifyApi(dir, true, function (p) { bar.firstChild.style.width = Math.round(p * 100) + '%'; }).then(function (res) {
          choose.classList.remove('loading');
          bar.classList.add('hidden');
          checkRows(res, checks);
          var usable = res.engines.whispercpp || res.engines.whisperx;
          var pt = problemText(res);
          if (pt) { msg.textContent = pt; msg.classList.remove('hidden'); }
          choose.lastChild.textContent = usable ? 'Choose Another Folder' : 'Choose API Folder';
          choose.className = usable ? 'btn ghost block' : 'btn primary block';
          if (usable) { cont.classList.remove('hidden'); cont.className = 'btn primary block'; cont.style.marginTop = '.5rem'; }
        });
      }
      choose.addEventListener('click', function () {
        CQ.host.chooseFolder('Choose the CyriqCap API folder', path).then(function (dir) { if (dir) { path = dir; run(dir); } });
      });
      cont.addEventListener('click', function () {
        ov.style.transition = 'opacity .3s'; ov.style.opacity = '0';
        setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); resolve(); }, 300);
      });
      if (path) run(path);
    });
  }

  /* ---------------------------------------------------------- settings view */
  function renderApi() {
    var res = CQ.app.api;
    V.apiPath.textContent = CQ.app.apiDir || 'Not set';
    V.apiChecks.innerHTML = '';
    checkRows(res, V.apiChecks);
    V.apiMsg.textContent = problemText(res);
    V.apiVer.textContent = res && res.version ? 'v' + res.version : '';
  }

  function renderFonts() {
    if (!CQ.services.hasNode) return;
    var st;
    try { st = CQ.services.Fonts.status(CQ.host.extensionPath()); } catch (e) { st = []; }
    V.fontList.innerHTML = '';
    var n = 0;
    st.forEach(function (f) {
      if (f.installed) n++;
      V.fontList.appendChild(el('div', { class: 'font-item' }, [el('span', { text: f.file.replace(/\.(ttf|otf)$/i, '') }), el('i', { class: f.installed ? 'ok' : '' })]));
    });
    V.fontState.textContent = n + ' / ' + st.length;
    V.fontState.className = 'badge ' + (n === st.length ? 'ok' : 'warn');
  }

  function installFonts() {
    V.fontBtn.classList.add('loading');
    CQ.services.Fonts.install(CQ.host.extensionPath()).then(function (r) {
      V.fontBtn.classList.remove('loading');
      renderFonts();
      if (r.failed.length) U.modal({ kind: 'warn', title: 'Some fonts were not installed', list: r.failed });
      else U.modal({ kind: 'info', icon: 'font', title: 'Fonts installed', text: 'Restart After Effects once so the new fonts appear in the Character panel and in presets.' });
    }, function (e) { V.fontBtn.classList.remove('loading'); U.modal({ kind: 'err', title: 'Font install failed', text: e.message }); });
  }

  function diagnostics() {
    var a = CQ.app.api || {};
    var lines = [
      'CyriqCap ' + CQ.app.version, 'After Effects ' + (CQ.app.aeVersion || '?'), 'OS ' + (CQ.services.hasNode ? process.platform + ' ' + require('os').release() : 'n/a'),
      'API ' + (a.version || '-') + ' ok=' + !!a.ok + ' engines=' + JSON.stringify(a.engines || {}),
      'Missing: ' + (a.missing || []).length + ' Wrong size: ' + (a.wrongSize || []).length + ' Bad hash: ' + (a.badHash || []).length,
      'Plug-ins: ' + JSON.stringify(CQ.app.plugins)
    ];
    return lines.join('\n');
  }

  function build(rootEl) {
    V.apiPath = el('div', { class: 'path-box' });
    V.apiChecks = el('div', { class: 'checks' });
    V.apiMsg = el('div', { class: 'lbl', style: { color: 'var(--err)', whiteSpace: 'normal' } });
    V.apiVer = el('span', { class: 'badge info' });
    var change = el('button', { class: 'btn', onclick: function () { CQ.host.chooseFolder('Choose the CyriqCap API folder', CQ.app.apiDir).then(function (d) { if (d) CQ.app.setApiDir(d); }); } }, [U.icon('folder'), 'Change']);
    var recheck = el('button', { class: 'btn ghost', onclick: function () { recheck.classList.add('loading'); CQ.app.verifyApi(CQ.app.apiDir, true).then(function () { recheck.classList.remove('loading'); renderApi(); U.toast('ok', 'Check finished', problemText(CQ.app.api) || 'All files are present and intact.'); }); } }, [U.icon('shield'), 'Full check']);

    V.fontList = el('div', { class: 'font-list' });
    V.fontState = el('span', { class: 'badge' });
    V.fontBtn = el('button', { class: 'btn primary', onclick: installFonts }, [U.icon('font'), 'Install Fonts']);

    var plugList = el('div');
    function renderPlugins() {
      plugList.innerHTML = '';
      Object.keys(CQ.presets.PLUGINS).forEach(function (k) {
        var pl = CQ.presets.PLUGINS[k], ok = CQ.app.plugins[k];
        plugList.appendChild(el('div', { class: 'kv' }, [el('span', { class: 'k', text: pl.name }), el('span', { class: 'badge ' + (ok ? 'ok' : 'warn'), text: ok ? 'Installed' : 'Not found' })]));
      });
    }
    V.renderPlugins = renderPlugins;

    rootEl.appendChild(el('div', { class: 'cap-layout' }, [
      el('div', null, [
        el('div', { class: 'card' }, [el('h3', null, [el('span', { class: 'grow', text: 'API folder' }), V.apiVer]), V.apiPath, el('div', { class: 'row' }, [change, recheck]), V.apiMsg, V.apiChecks]),
        el('div', { class: 'card' }, [el('h3', null, [el('span', { class: 'grow', text: 'Plug-ins' }), el('button', { class: 'btn ghost', style: { height: '1.8rem' }, onclick: function () { CQ.app.scanPlugins(true).then(renderPlugins); } }, [U.icon('refresh'), 'Scan'])]), plugList])
      ]),
      el('div', null, [
        el('div', { class: 'card' }, [el('h3', null, [el('span', { class: 'grow', text: 'Fonts' }), V.fontState]), el('div', { class: 'row' }, [V.fontBtn]), V.fontList]),
        el('div', { class: 'card' }, [el('h3', { text: 'Diagnostics' }), el('div', { class: 'row' }, [
          el('button', { class: 'btn', onclick: function () { CQ.host.openFolder(CQ.services.Log.dir()); } }, [U.icon('log'), 'Open logs']),
          el('button', { class: 'btn ghost', onclick: function () { U.modal({ kind: 'info', title: 'Diagnostics', detail: diagnostics(), text: 'No transcript text or media paths are included.' }); } }, [U.icon('copy'), 'Show info'])
        ])]),
        el('div', { class: 'card' }, [el('h3', { text: 'About' }),
          el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Version' }), el('span', { class: 'v', text: CQ.app.version })]),
          el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Network' }), el('span', { class: 'v', text: 'Offline' })]),
          el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Licenses' }), el('span', { class: 'v' }, [el('button', { class: 'btn ghost', style: { height: '1.7rem' }, onclick: function () { CQ.host.openFolder(require('path').join(CQ.host.extensionPath(), 'licenses')); } }, ['Open'])])])
        ])
      ])
    ]));
    renderApi(); renderFonts(); renderPlugins();
  }

  CQ.settings = { build: build, onboarding: onboarding, renderApi: function () { if (V.apiPath) renderApi(); }, renderPlugins: function () { if (V.renderPlugins) V.renderPlugins(); }, renderFonts: function () { if (V.fontList) renderFonts(); }, fmtBytes: fmtBytes };
})(typeof window !== 'undefined' ? window : global);

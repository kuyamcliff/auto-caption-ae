/* Settings page and the first-run setup screen. */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui, el = U.el;
  var V = {};

  /* ---------------------------------------------------------- setup screen */
  // Choose folder -> "Verifying API" (instant) -> ready. Nothing else to read.
  function setup() {
    return new Promise(function (resolve) {
      if (U.$('#setup')) return resolve();
      var state = el('div', { class: 'state hidden' });
      var pathEl = el('div', { class: 'path hidden' });
      var choose = U.btn('Choose API Folder', { cls: 'primary block', icon: 'folder' });
      var box = el('div', { class: 'box' }, [
        el('div', { class: 'logo', html: CQ.icons.mark }),
        el('h1', { text: 'Welcome to CyriqCap' }),
        el('p', { text: 'Choose the CyriqCap-API folder from your download to start.' }),
        state, pathEl, choose
      ]);
      var ov = el('div', { id: 'setup' }, [box]);
      document.body.appendChild(ov);
      function setState(kind, text) { state.className = 'state ' + kind; U.clear(state); state.appendChild(U.svg(kind === 'run' ? 'spin' : kind === 'ok' ? 'ok' : 'alert')); state.appendChild(document.createTextNode(text)); }
      function finish() { ov.classList.add('out'); setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 250); resolve(); }
      function check(d) {
        choose.classList.add('hidden');
        pathEl.textContent = d; pathEl.classList.remove('hidden');
        setState('run', 'Verifying API…');
        // the check itself is instant; a short pause keeps the step readable
        setTimeout(function () {
          CQ.app.verifyApi(d).then(function (r) {
            var usable = r.engines && (r.engines.whispercpp || r.engines.whisperx);
            if (usable) { setState('ok', 'API ready'); setTimeout(finish, 700); return; }
            setState('bad', r.problems.indexOf('INCOMPLETE') >= 0 ? 'Some API files are missing' : 'This is not the CyriqCap-API folder');
            choose.setLabel('Choose Another Folder'); choose.classList.remove('hidden');
          });
        }, 350);
      }
      choose.addEventListener('click', function () { CQ.host.chooseFolder('Select the CyriqCap-API folder', CQ.app.apiDir || '').then(function (d) { if (d) check(d); }); });
    });
  }

  /* ---------------------------------------------------------- settings page */
  function renderApi() {
    if (!V.path) return;
    V.path.textContent = CQ.app.apiDir || 'Not set';
    var a = CQ.app.api, cls = 'err', txt = 'Not set up';
    if (a && a.ok) { cls = 'ok'; txt = 'Ready'; }
    else if (a && a.engines && (a.engines.whispercpp || a.engines.whisperx)) { cls = 'warn'; txt = 'Ready (some files missing)'; }
    V.apiState.className = 'status ' + cls;
    U.clear(V.apiState); V.apiState.appendChild(el('span', { class: 'dot' })); V.apiState.appendChild(document.createTextNode(txt));
  }

  function renderPlugins() {
    if (!V.plugs) return;
    U.clear(V.plugs);
    Object.keys(CQ.presets.PLUGINS).forEach(function (k) {
      var pl = CQ.presets.PLUGINS[k], ok = CQ.app.plugins[k];
      V.plugs.appendChild(el('div', { class: 'kv' }, [el('span', { class: 'k', text: pl.name }), el('span', { class: 'v' + (ok ? ' ok' : ''), text: ok ? 'Installed' : 'Not installed' })]));
    });
  }

  function renderFonts() {
    if (!V.fontState) return;
    var st = [];
    if (CQ.services.hasNode) { try { st = CQ.services.Fonts.status(CQ.host.extensionPath()); } catch (e) { st = []; } }
    else st = Object.keys(CQ.presets.FONTS).map(function () { return { installed: true }; });
    var n = st.filter(function (f) { return f.installed; }).length;
    V.fontState.textContent = n + ' of ' + st.length + ' installed';
    V.fontBtn.setLabel(n === st.length && st.length ? 'Reinstall Fonts' : 'Install Fonts');
  }

  function installFonts() {
    if (!CQ.services.hasNode) { U.toast('ok', 'Fonts installed'); return; }
    V.fontBtn.setBusy(true);
    CQ.services.Fonts.install(CQ.host.extensionPath()).then(function (r) {
      V.fontBtn.setBusy(false); renderFonts();
      if (r.failed.length) U.dialog({ kind: 'warn', title: 'Some fonts were not installed', text: 'Close After Effects and run the installer again.' });
      else U.dialog({ title: 'Fonts installed', icon: 'check', text: 'Restart After Effects once so they appear everywhere.' });
    }, function () { V.fontBtn.setBusy(false); U.dialog({ kind: 'err', title: 'Fonts were not installed', text: 'Close After Effects and run the installer again.' }); });
  }

  function changeFolder() {
    CQ.host.chooseFolder('Select the CyriqCap-API folder', CQ.app.apiDir).then(function (d) {
      if (!d) return;
      CQ.app.verifyApi(d).then(function (r) {
        if (r.engines && (r.engines.whispercpp || r.engines.whisperx)) U.toast('ok', 'API ready');
        else U.dialog({ kind: 'warn', title: 'This is not the CyriqCap-API folder', text: 'Choose the CyriqCap-API folder from your download.' });
      });
    });
  }

  function build(rootEl) {
    V.path = el('div', { class: 'pathline' });
    V.apiState = el('span', { class: 'status' });
    V.fontState = el('span', { class: 'r muted' });
    V.fontBtn = U.btn('Install Fonts', { icon: 'font', onClick: installFonts });
    V.plugs = el('div', { class: 'tile', style: { padding: '2px 8px' } });
    var logs = el('button', { class: 'link', text: 'Open', onclick: function () { if (CQ.services.hasNode) CQ.host.openFolder(CQ.services.Log.dir()); } });
    var lic = el('button', { class: 'link', text: 'Open', onclick: function () { if (CQ.services.hasNode) CQ.host.openFolder(require('path').join(CQ.host.extensionPath(), 'licenses')); } });
    rootEl.appendChild(el('div', { class: 'subhead' }, [U.iconBtn('back', 'Back', function () { CQ.app.go(CQ.app.lastTab || 'captions'); }), 'Settings']));
    rootEl.appendChild(el('div', { class: 'scroll' }, [
      el('div', { class: 'sec' }, [el('h3', null, ['API folder', el('span', { class: 'r' }, [V.apiState])]), V.path, U.btn('Change Folder', { icon: 'folder', onClick: changeFolder })]),
      el('div', { class: 'sec' }, [el('h3', { text: 'Models' }), CQ.modelsUI.section()]),
      el('div', { class: 'sec' }, [el('h3', null, ['Fonts', V.fontState]), V.fontBtn]),
      el('div', { class: 'sec' }, [el('h3', null, ['Plug-ins', el('span', { class: 'r' }, [el('button', { class: 'link', text: 'Scan again', onclick: function () { CQ.app.scanPlugins(true).then(function () { renderPlugins(); CQ.animate.refresh(); U.toast('ok', 'Plug-ins scanned'); }); } })])]), V.plugs]),
      el('div', { class: 'sec' }, [el('h3', { text: 'About' }), el('div', { class: 'tile', style: { padding: '2px 8px' } }, [
        el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Version' }), el('span', { class: 'v', text: CQ.app.version })]),
        el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Logs' }), logs]),
        el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Licenses' }), lic])
      ])])
    ]));
    renderApi(); renderFonts(); renderPlugins();
  }

  CQ.settings = { build: build, setup: setup, renderApi: renderApi, renderPlugins: renderPlugins, renderFonts: renderFonts };
})(typeof window !== 'undefined' ? window : global);

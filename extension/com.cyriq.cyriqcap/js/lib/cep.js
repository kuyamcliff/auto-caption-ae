/*
 * Bridge to After Effects. Uses the CEP runtime directly (no Adobe library
 * needed). Outside After Effects (browser preview, tests, screenshots) it
 * falls back to a mock host so the panel can still be developed and shown.
 */
(function (root) {
  'use strict';
  var CQ = root.CQ = root.CQ || {};
  var cep = root.__adobe_cep__ || null;

  function parse(res) {
    if (res === 'EvalScript error.' || res == null || res === '') throw new Error('After Effects did not answer (script error).');
    try { return JSON.parse(res); } catch (e) { throw new Error('Unexpected answer from After Effects.'); }
  }

  var queue = Promise.resolve();

  var host = {
    inAE: !!cep,
    /** Call CQ.<fn>(jsonString) in the host. Calls are serialised. */
    call: function (fn, payload) {
      if (!/^[A-Za-z]+$/.test(fn)) return Promise.reject(new Error('bad host call'));
      var arg = payload === undefined ? '' : JSON.stringify(JSON.stringify(payload));
      var script = 'typeof CQ!=="undefined"&&CQ.' + fn + '?CQ.' + fn + '(' + arg + '):"' + '{\\"ok\\":false,\\"code\\":\\"HOST_NOT_LOADED\\",\\"message\\":\\"Host script not loaded\\"}' + '"';
      var p = queue.then(function () {
        if (!cep) return CQ.mockHost.call(fn, payload);
        return new Promise(function (resolve, reject) {
          try { cep.evalScript(script, function (res) { try { resolve(parse(res)); } catch (e) { reject(e); } }); }
          catch (e) { reject(e); }
        });
      });
      queue = p.catch(function () {});
      return p;
    },
    extensionPath: function () {
      if (cep) {
        var p = cep.getSystemPath('extension');
        p = decodeURIComponent(p.replace(/^file:\/{2,3}/, ''));
        if (/^[A-Za-z]:/.test(p) === false && /^\/[A-Za-z]:/.test(p)) p = p.slice(1);
        return p;
      }
      return CQ.services.hasNode ? require('path').resolve(__dirname || '.') : '.';
    },
    loadHostScript: function () {
      if (!cep) return Promise.resolve();
      var p = host.extensionPath().replace(/\\/g, '/') + '/jsx/host.jsx';
      return new Promise(function (resolve) { cep.evalScript('$.evalFile(' + JSON.stringify(p) + ')', function () { resolve(); }); });
    },
    chooseFolder: function (title, initial) {
      try {
        if (root.cep && root.cep.fs && root.cep.fs.showOpenDialogEx) {
          var r = root.cep.fs.showOpenDialogEx(false, true, title || 'Choose folder', initial || '', []);
          if (r && r.data && r.data.length) return Promise.resolve(r.data[0]);
          return Promise.resolve(null);
        }
      } catch (e) {}
      return Promise.resolve(root.prompt ? root.prompt(title || 'Folder path') : null);
    },
    openURL: function (url) {
      try { if (root.cep && root.cep.util) return root.cep.util.openURLInDefaultBrowser(url); } catch (e) {}
      root.open(url, '_blank');
    },
    openFolder: function (dir) {
      if (!CQ.services.hasNode || !dir) return;
      try {
        var cp = (root.cep_node ? root.cep_node.require : require)('child_process');
        if (CQ.services.isWin) cp.spawn('explorer.exe', [dir], { detached: true, shell: false });
        else cp.spawn('xdg-open', [dir], { detached: true, shell: false });
      } catch (e) {}
    },
    onThemeChange: function () {}
  };

  CQ.host = host;
})(typeof window !== 'undefined' ? window : global);

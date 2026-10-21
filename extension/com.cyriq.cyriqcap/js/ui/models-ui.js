/* Models: installed list + one-click downloads into the API folder. */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui, el = U.el;
  var active = {};   // id -> {pct, signal}
  var listeners = [];

  function notify() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  function refreshStatus() {
    if (CQ.services.hasNode && CQ.app.apiDir) CQ.app.modelStatus = CQ.services.Models.status(CQ.app.apiDir);
    else if (!CQ.services.hasNode) CQ.app.modelStatus = CQ.mockHost.modelStatus();
    if (CQ.captionsView) CQ.captionsView.onModels();
    notify();
  }

  function download(id) {
    if (active[id]) return;
    if (!CQ.app.apiDir) { CQ.app.apiReady(); return; }
    var sig = CQ.services.hasNode ? new CQ.services.Signal() : { aborted: false, abort: function () { this.aborted = true; } };
    active[id] = { pct: 0, signal: sig };
    notify();
    var onP = function (pct) { if (active[id]) { active[id].pct = pct; notify(); } };
    var p = CQ.services.hasNode ? CQ.services.Models.download(CQ.app.apiDir, id, onP, sig) : CQ.mockHost.downloadModel(id, onP, sig);
    p.then(function () {
      delete active[id];
      refreshStatus();
      U.toast('ok', CQ.models.byId(id).name + ' model ready');
    }, function (e) {
      delete active[id];
      refreshStatus();
      if (e.code === 'CANCELLED') return;
      var f = CQ.services.friendly(e);
      U.dialog({ kind: 'err', title: f.title, text: f.text });
    });
  }

  function cancel(id) { if (active[id]) active[id].signal.abort(); }

  function remove(id) {
    var m = CQ.models.byId(id);
    U.dialog({ kind: 'warn', icon: 'trash', title: 'Remove ' + m.name + '?', text: 'Its files are deleted from the API folder. You can download it again later.', actions: [{ label: 'Cancel' }, { label: 'Remove', primary: true, onClick: function () {
      if (CQ.services.hasNode) CQ.services.Models.remove(CQ.app.apiDir, id); else CQ.mockHost.removeModel(id);
      refreshStatus();
    } }] });
  }

  function renderList(box) {
    U.clear(box);
    (CQ.app.modelStatus || []).forEach(function (m) {
      var def = CQ.models.byId(m.id);
      var act = el('div', { class: 'act' });
      var a = active[m.id];
      if (a) {
        act.appendChild(el('div', { class: 'bar' }, [el('i', { style: { width: Math.round(a.pct * 100) + '%' } })]));
        act.appendChild(el('span', { class: 'pc', text: Math.round(a.pct * 100) + '%' }));
        act.appendChild(U.iconBtn('x', 'Cancel', function () { cancel(m.id); }));
      } else if (m.installed) {
        act.appendChild(el('span', { class: 'inst' }, [U.svg('check'), 'Installed']));
        if (!def.bundled) act.appendChild(U.iconBtn('trash', 'Remove', function () { remove(m.id); }));
      } else {
        act.appendChild(U.btn('Download', { icon: 'download', onClick: function () { download(m.id); } }));
      }
      box.appendChild(el('div', { class: 'm' }, [
        el('div', { class: 'info' }, [el('div', { text: m.name }), el('small', { text: def.tag + '  ·  ' + CQ.models.fmtSize(m.size) })]),
        act
      ]));
    });
  }

  function section() {
    var box = el('div', { class: 'tile models' });
    listeners.push(function () { if (box.isConnected) renderList(box); });
    renderList(box);
    return box;
  }

  function open() {
    if (!CQ.app.apiDir) { CQ.app.apiReady(); return; }
    refreshStatus();
    var box = el('div', { class: 'tile models' });
    var fn = function () { renderList(box); };
    listeners.push(fn);
    fn();
    U.dialog({ title: 'Models', icon: 'model', text: 'Bigger models are more accurate but slower. Downloads go into your API folder.', body: box, wide: true, actions: [{ label: 'Done', primary: true }] })
      .then(function () { listeners.splice(listeners.indexOf(fn), 1); });
  }

  CQ.modelsUI = { open: open, refresh: refreshStatus, section: section, download: download };
})(typeof window !== 'undefined' ? window : global);

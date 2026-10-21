/* Model manager: installed models + one-click downloads into the API folder. */
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
    var sig = CQ.services.hasNode ? new CQ.services.Signal() : { abort: function () { sig.aborted = true; } };
    active[id] = { pct: 0, signal: sig };
    notify();
    var p = CQ.services.hasNode
      ? CQ.services.Models.download(CQ.app.apiDir, id, function (pct) { active[id].pct = pct; notify(); }, sig)
      : CQ.mockHost.downloadModel(id, function (pct) { active[id].pct = pct; notify(); }, sig);
    p.then(function () {
      delete active[id];
      refreshStatus();
      var m = CQ.models.byId(id);
      U.toast('ok', m.name + ' model ready');
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
    U.dialog({ kind: 'warn', title: 'Remove ' + m.name + '?', text: 'The model files are deleted from the API folder. You can download them again later.', actions: [{ label: 'Cancel' }, { label: 'Remove', primary: true, onClick: function () {
      if (CQ.services.hasNode) CQ.services.Models.remove(CQ.app.apiDir, id); else CQ.mockHost.removeModel(id);
      refreshStatus();
    } }] });
  }

  function renderList(box) {
    box.innerHTML = '';
    (CQ.app.modelStatus || []).forEach(function (m) {
      var def = CQ.models.byId(m.id);
      var act = el('div', { class: 'act' });
      var a = active[m.id];
      if (a) {
        act.appendChild(el('div', { class: 'bar' }, [el('i', { style: { width: Math.round(a.pct * 100) + '%' } })]));
        act.appendChild(el('span', { class: 'muted', style: { width: '2.6rem', fontSize: '.85rem' }, text: Math.round(a.pct * 100) + '%' }));
        act.appendChild(U.btn('', { cls: 'icon sm ghost', icon: 'x', title: 'Cancel', onClick: function () { cancel(m.id); } }));
      } else if (m.installed) {
        act.appendChild(el('span', { class: 'ok' }, [U.svg('check'), 'Installed']));
        if (!def.bundled) act.appendChild(U.btn('', { cls: 'icon sm ghost', icon: 'trash', title: 'Remove', onClick: function () { remove(m.id); } }));
      } else {
        act.appendChild(U.btn('Download', { cls: 'sm', icon: 'download', onClick: function () { download(m.id); } }));
      }
      box.appendChild(el('div', { class: 'm' }, [
        el('div', { class: 'info' }, [el('b', { text: m.name }), el('small', { text: def.tag + ' · ' + CQ.models.fmtSize(m.size) })]),
        act
      ]));
    });
  }

  function open() {
    if (!CQ.app.apiDir) { CQ.app.apiReady(); return; }
    refreshStatus();
    var box = el('div', { class: 'models', style: { marginTop: '.8rem' } });
    var fn = function () { renderList(box); };
    listeners.push(fn);
    fn();
    U.dialog({ title: 'Models', text: 'Larger models are more accurate but slower. Downloads are saved in your API folder.', icon: 'model', body: box, wide: true, actions: [{ label: 'Done', primary: true }] })
      .then(function () { listeners.splice(listeners.indexOf(fn), 1); });
  }

  function section() {
    var box = el('div', { class: 'models' });
    var fn = function () { renderList(box); };
    listeners.push(fn);
    fn();
    return box;
  }

  CQ.modelsUI = { open: open, refresh: refreshStatus, section: section, download: download };
})(typeof window !== 'undefined' ? window : global);

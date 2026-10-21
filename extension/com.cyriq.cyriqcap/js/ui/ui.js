/* Small UI toolkit: element builder, toasts, modals, ripple, settings store. */
(function (root) {
  'use strict';
  var CQ = root.CQ = root.CQ || {};
  var doc = root.document;

  function el(tag, attrs, children) {
    var e = doc.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') { for (var s in v) e.style[s] = v[s]; }
      else e.setAttribute(k, v === true ? '' : v);
    }
    (children || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
    return e;
  }
  function icon(name, cls) { var s = el('span', { class: 'icn' + (cls ? ' ' + cls : ''), html: CQ.icons[name] || '' }); s.style.display = 'contents'; return s; }
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  /* ripple on every .btn */
  doc.addEventListener('mousedown', function (ev) {
    var b = ev.target.closest ? ev.target.closest('.btn') : null;
    if (!b || b.disabled) return;
    var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height);
    var s = el('span', { class: 'ripple', style: { width: d + 'px', height: d + 'px', left: (ev.clientX - r.left - d / 2) + 'px', top: (ev.clientY - r.top - d / 2) + 'px' } });
    b.appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 650);
  });

  /* toasts */
  function toast(kind, title, msg, ms) {
    var box = $('#toasts');
    var t = el('div', { class: 'toast ' + (kind || '') }, [
      el('span', { class: 'ti', html: CQ.icons[kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : kind === 'warn' ? 'alert' : 'info'] }),
      el('div', { class: 'tb' }, [el('b', { text: title }), msg ? el('small', { text: msg }) : null]),
      el('button', { class: 'x', text: '×', onclick: function () { close(); } })
    ]);
    function close() { t.classList.add('out'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300); }
    box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(close, ms || (kind === 'err' ? 9000 : 4500));
    return close;
  }

  /* modal: opts = {kind, title, text, list, detail, actions:[{label, primary, onClick}]} */
  function modal(opts) {
    return new Promise(function (resolve) {
      var back = el('div', { class: 'modal-back' });
      function close(v) { if (back.parentNode) back.parentNode.removeChild(back); doc.removeEventListener('keydown', esc); resolve(v); }
      function esc(e) { if (e.key === 'Escape') close(null); }
      var actions = (opts.actions || [{ label: 'OK', primary: true }]).map(function (a, i) {
        return el('button', { class: 'btn' + (a.primary ? ' primary' : ' ghost'), text: a.label, onclick: function () { if (a.onClick) a.onClick(); close(a.value != null ? a.value : i); } });
      });
      var m = el('div', { class: 'modal', role: 'dialog' }, [
        el('div', { class: 'mi ' + (opts.kind || 'info'), html: CQ.icons[opts.icon || (opts.kind === 'err' ? 'alert' : opts.kind === 'warn' ? 'alert' : 'info')] }),
        el('h2', { text: opts.title || '' }),
        opts.text ? el('p', { text: opts.text }) : null,
        opts.list ? el('ul', null, opts.list.map(function (x) { return el('li', { text: x }); })) : null,
        opts.detail ? el('pre', { text: opts.detail }) : null,
        el('div', { class: 'actions' }, actions)
      ]);
      back.appendChild(m);
      back.addEventListener('mousedown', function (e) { if (e.target === back) close(null); });
      doc.addEventListener('keydown', esc);
      doc.body.appendChild(back);
    });
  }

  /* settings (per-user convenience; nothing private is stored) */
  var store = {
    get: function (k, d) { try { var v = root.localStorage.getItem('cq.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { root.localStorage.setItem('cq.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  function field(label, control, cls) { return el('div', { class: 'field' + (cls ? ' ' + cls : '') }, [el('label', { text: label }), control]); }

  function select(options, value, onChange) {
    var s = el('select', { class: 'input' });
    options.forEach(function (o) {
      if (o.group) {
        var g = el('optgroup', { label: o.group });
        o.items.forEach(function (it) { g.appendChild(el('option', { value: it.value, text: it.label })); });
        s.appendChild(g);
      } else s.appendChild(el('option', { value: o.value, text: o.label }));
    });
    s.value = value;
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }

  function swatch(value, onChange) {
    var span = el('span', { style: { background: value } });
    var lab = el('b', { text: String(value).toUpperCase() });
    var inp = el('input', { type: 'color', value: value });
    inp.addEventListener('input', function () { span.style.background = inp.value; lab.textContent = inp.value.toUpperCase(); onChange(inp.value); });
    var w = el('label', { class: 'swatch' }, [span, lab, inp]);
    w.set = function (v) { inp.value = v; span.style.background = v; lab.textContent = String(v).toUpperCase(); };
    return w;
  }

  function toggle(checked, onChange) {
    var inp = el('input', { type: 'checkbox' });
    inp.checked = !!checked;
    inp.addEventListener('change', function () { onChange(inp.checked); });
    var l = el('label', { class: 'switch' }, [inp, el('i')]);
    l.input = inp;
    return l;
  }

  function range(min, max, step, value, onInput) {
    var r = el('input', { type: 'range', min: min, max: max, step: step, value: value });
    function paint() { r.style.setProperty('--p', ((r.value - min) / (max - min) * 100) + '%'); }
    r.addEventListener('input', function () { paint(); onInput(Number(r.value)); });
    paint();
    return r;
  }

  function number(value, min, max, step, onChange) {
    var n = el('input', { class: 'input', type: 'number', value: value, min: min, max: max, step: step || 1 });
    n.addEventListener('change', function () {
      var v = Number(n.value);
      if (!isFinite(v)) v = value;
      v = Math.min(max, Math.max(min, v));
      n.value = v; onChange(v);
    });
    return n;
  }

  function seg(items, value, onChange) {
    var w = el('div', { class: 'seg' });
    items.forEach(function (it) {
      var b = el('button', { text: it.label, title: it.title || it.label, class: it.value === value ? 'active' : '' });
      b.addEventListener('click', function () { $$('button', w).forEach(function (x) { x.classList.remove('active'); }); b.classList.add('active'); onChange(it.value); });
      w.appendChild(b);
    });
    return w;
  }

  /** Player that only runs while its canvas is visible. */
  var visObs = root.IntersectionObserver ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      var pl = en.target._player;
      if (!pl) return;
      if (en.isIntersecting && !pl.paused) pl.start(); else pl.stop(false);
    });
  }, { threshold: 0.05 }) : null;
  function watch(canvas, player) { canvas._player = player; if (visObs) visObs.observe(canvas); else player.start(); }

  CQ.ui = { el: el, icon: icon, $: $, $$: $$, toast: toast, modal: modal, store: store, field: field, select: select, swatch: swatch, toggle: toggle, range: range, number: number, seg: seg, watch: watch };
})(typeof window !== 'undefined' ? window : global);

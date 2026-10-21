/* Small UI toolkit: element builder, controls, toasts, dialogs, settings store. */
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
  function svg(name) { var s = el('span', { html: CQ.icons[name] || '' }); return s.firstChild; }
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function btn(label, opts) {
    var o = opts || {};
    var b = el('button', { class: 'btn' + (o.cls ? ' ' + o.cls : ''), title: o.title || null, onclick: o.onClick || null });
    if (o.icon) b.appendChild(svg(o.icon));
    if (label) b.appendChild(doc.createTextNode(label));
    b.setBusy = function (on) {
      b.classList.toggle('busy', !!on);
      if (on) { b._ic = b.querySelector('svg'); var sp = svg('spin'); if (b._ic) b.replaceChild(sp, b._ic); else b.insertBefore(sp, b.firstChild); b._sp = sp; }
      else if (b._sp) { if (b._ic) b.replaceChild(b._ic, b._sp); else b.removeChild(b._sp); b._sp = null; }
    };
    return b;
  }

  /* toasts */
  function toast(kind, title, msg, ms) {
    var box = $('#toasts');
    var t = el('div', { class: 'toast ' + (kind || '') }, [
      el('span', { class: 'ti', html: CQ.icons[kind === 'ok' ? 'ok' : kind === 'err' ? 'alert' : kind === 'warn' ? 'warn' : 'info'] }),
      el('div', { class: 'tb' }, [title, msg ? el('small', { text: msg }) : null]),
      el('button', { class: 'x', html: CQ.icons.x, onclick: function () { close(); } })
    ]);
    function close() { if (t.parentNode) t.parentNode.removeChild(t); }
    box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(close, ms || 4500);
    return close;
  }

  /* dialog: {kind, title, text, list, actions:[{label, primary, onClick}], wide, body} - never shows raw errors */
  function dialog(opts) {
    return new Promise(function (resolve) {
      var back = el('div', { class: 'dlg-back' });
      function close(v) { if (back.parentNode) back.parentNode.removeChild(back); doc.removeEventListener('keydown', esc); resolve(v); }
      function esc(e) { if (e.key === 'Escape') close(null); }
      var acts = (opts.actions || [{ label: 'OK', primary: true }]).map(function (a, i) {
        return el('button', { class: 'btn' + (a.primary ? ' primary' : ''), text: a.label, onclick: function () { if (a.onClick) a.onClick(); close(i); } });
      });
      var icon = opts.icon || (opts.kind === 'err' ? 'alert' : opts.kind === 'warn' ? 'warn' : 'info');
      var d = el('div', { class: 'dlg' + (opts.wide ? ' wide' : '') }, [
        opts.title ? el('div', { class: 'dh ' + (opts.kind || '') }, [svg(icon), el('div', { class: 'grow' }, [el('h2', { text: opts.title }), opts.text ? el('p', { text: opts.text }) : null,
          opts.list ? el('ul', null, opts.list.map(function (x) { return el('li', { text: x }); })) : null])]) : null,
        opts.body || null,
        el('div', { class: 'acts' }, acts)
      ]);
      back.appendChild(d);
      back.addEventListener('mousedown', function (e) { if (e.target === back) close(null); });
      doc.addEventListener('keydown', esc);
      doc.body.appendChild(back);
      if (opts.onOpen) opts.onOpen(close);
    });
  }

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
        o.items.forEach(function (it) { g.appendChild(el('option', { value: it.value, text: it.label, disabled: it.disabled || null })); });
        s.appendChild(g);
      } else s.appendChild(el('option', { value: o.value, text: o.label, disabled: o.disabled || null }));
    });
    s.value = value;
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }

  function color(value, onChange) {
    var sw = el('i', { style: { background: value } }), lab = el('span', { text: String(value).toUpperCase() });
    var inp = el('input', { type: 'color', value: value });
    inp.addEventListener('input', function () { sw.style.background = inp.value; lab.textContent = inp.value.toUpperCase(); onChange(inp.value); });
    return el('label', { class: 'color' }, [sw, lab, inp]);
  }

  function check(label, checked, onChange) {
    var inp = el('input', { type: 'checkbox' });
    inp.checked = !!checked;
    inp.addEventListener('change', function () { onChange(inp.checked); });
    return el('label', { class: 'check' }, [inp, label]);
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

  /* items: [{label|icon, value, title}] */
  function seg(items, value, onChange) {
    var w = el('div', { class: 'seg' });
    items.forEach(function (it) {
      var b = el('button', { title: it.title || it.label || null, class: it.value === value ? 'active' : '' });
      if (it.icon) b.appendChild(svg(it.icon)); else b.textContent = it.label;
      b.addEventListener('click', function () { $$('button', w).forEach(function (x) { x.classList.remove('active'); }); b.classList.add('active'); onChange(it.value); });
      w.appendChild(b);
    });
    return w;
  }

  /** Players only run while their canvas is visible. */
  var visObs = root.IntersectionObserver ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      var pl = en.target._player;
      if (!pl) return;
      if (en.isIntersecting && !pl.paused) pl.start(); else pl.stop(false);
    });
  }, { threshold: 0.05 }) : null;
  function watch(canvas, player) { canvas._player = player; if (visObs) visObs.observe(canvas); else player.start(); }

  CQ.ui = { el: el, svg: svg, btn: btn, $: $, $$: $$, toast: toast, dialog: dialog, modal: dialog, store: store, field: field, select: select, color: color, check: check, range: range, number: number, seg: seg, watch: watch };
})(typeof window !== 'undefined' ? window : global);

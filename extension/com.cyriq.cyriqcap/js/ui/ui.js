/* Small UI toolkit: elements, controls, popovers, toasts, dialogs, settings store, animation ticker. */
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
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }

  function btn(label, opts) {
    var o = opts || {};
    var b = el('button', { class: 'btn' + (o.cls ? ' ' + o.cls : ''), title: o.title || null, onclick: o.onClick || null });
    if (o.icon) b.appendChild(svg(o.icon));
    var t = doc.createTextNode(label || '');
    if (label) b.appendChild(t);
    b.setLabel = function (s) { t.nodeValue = s; if (!t.parentNode) b.appendChild(t); };
    b.setBusy = function (on) {
      b.classList.toggle('busy', !!on);
      var ic = b.querySelector('svg');
      if (on) { b._ic = ic; var sp = svg('spin'); if (ic) b.replaceChild(sp, ic); else b.insertBefore(sp, b.firstChild); b._sp = sp; }
      else if (b._sp) { if (b._ic) b.replaceChild(b._ic, b._sp); else b.removeChild(b._sp); b._sp = null; }
    };
    return b;
  }
  function iconBtn(icon, title, onClick) { return el('button', { class: 'iconbtn', title: title, onclick: onClick, html: CQ.icons[icon] }); }

  /* ---------------------------------------------------------- toasts */
  function toast(kind, title, msg, ms) {
    var box = $('#toasts');
    var t = el('div', { class: 'toast ' + (kind || '') }, [svg(kind === 'ok' ? 'ok' : kind === 'err' ? 'alert' : kind === 'warn' ? 'warn' : 'info'), el('span', { text: title }), msg ? el('small', { text: msg }) : null]);
    function close() { if (!t.parentNode) return; t.classList.add('out'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 200); }
    t.addEventListener('click', close);
    box.appendChild(t);
    while (box.children.length > 2) box.removeChild(box.firstChild);
    setTimeout(close, ms || 3200);
    return close;
  }

  /* ---------------------------------------------------------- dialog (never shows raw errors) */
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
        el('div', { class: 'dh ' + (opts.kind || '') }, [svg(icon), el('div', { class: 'grow' }, [el('h2', { text: opts.title }), opts.text ? el('p', { text: opts.text }) : null,
          opts.list ? el('ul', null, opts.list.map(function (x) { return el('li', { text: x }); })) : null])]),
        opts.body ? el('div', { class: 'body' }, [opts.body]) : null,
        el('div', { class: 'acts' }, acts)
      ]);
      back.appendChild(d);
      back.addEventListener('mousedown', function (e) { if (e.target === back) close(null); });
      doc.addEventListener('keydown', esc);
      doc.body.appendChild(back);
    });
  }

  /* ---------------------------------------------------------- popover */
  var openPop = null;
  function closePop() { if (openPop) { var p = openPop; openPop = null; if (p.el.parentNode) p.el.parentNode.removeChild(p.el); doc.removeEventListener('mousedown', p.out, true); if (p.onClose) p.onClose(); } }
  function popover(anchor, content, opts) {
    closePop();
    var o = opts || {};
    var p = el('div', { class: 'pop' }, [content]);
    doc.body.appendChild(p);
    var r = anchor.getBoundingClientRect(), vw = root.innerWidth, vh = root.innerHeight;
    var w = o.width || Math.max(r.width, p.offsetWidth);
    p.style.width = w + 'px';
    var left = Math.max(6, Math.min(vw - w - 6, o.alignRight ? r.right - w : r.left));
    var top = r.bottom + 3;
    if (top + p.offsetHeight > vh - 6 && r.top - p.offsetHeight - 3 > 6) top = r.top - p.offsetHeight - 3;
    p.style.left = left + 'px'; p.style.top = Math.max(6, top) + 'px';
    var rec = { el: p, onClose: o.onClose, out: function (e) { if (!p.contains(e.target) && !anchor.contains(e.target)) closePop(); } };
    doc.addEventListener('mousedown', rec.out, true);
    openPop = rec;
    return { close: closePop, el: p };
  }

  /* ---------------------------------------------------------- store */
  var store = {
    get: function (k, d) { try { var v = root.localStorage.getItem('cq.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { root.localStorage.setItem('cq.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------------------------------------------------------- controls */
  function field(label, control) { return el('div', { class: 'field' }, [el('label', { text: label }), control]); }

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

  /** After Effects style number: drag left/right to change, click to type. */
  function scrub(value, o, onChange) {
    var min = o.min == null ? -1e9 : o.min, max = o.max == null ? 1e9 : o.max, step = o.step || 1, dec = o.dec || 0;
    var v = value;
    var num = el('span'), unit = o.unit ? el('span', { class: 'u', text: o.unit }) : null;
    var s = el('span', { class: 'scrub', title: o.title || 'Drag or click to type' }, [num, unit]);
    function show() { num.textContent = Number(v).toFixed(dec); }
    function set(nv, fire) { nv = Math.min(max, Math.max(min, Math.round(nv / step) * step)); if (nv !== v) { v = nv; show(); if (fire !== false) onChange(v); } }
    show();
    s.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || s.querySelector('input')) return;
      e.preventDefault();
      var x0 = e.clientX, v0 = v, moved = false;
      var range = max - min, per = o.per || (range > 400 ? 1 : range > 40 ? 0.25 : step / 2);
      function mv(ev) { var dx = ev.clientX - x0; if (Math.abs(dx) > 2) moved = true; if (moved) set(v0 + dx * per * (ev.shiftKey ? 10 : 1) / (step < 1 ? 1 : 1)); }
      function up() {
        doc.removeEventListener('mousemove', mv); doc.removeEventListener('mouseup', up);
        if (!moved) edit();
      }
      doc.addEventListener('mousemove', mv); doc.addEventListener('mouseup', up);
    });
    function edit() {
      var inp = el('input', { value: Number(v).toFixed(dec) });
      s.replaceChild(inp, num); if (unit) unit.style.display = 'none';
      inp.focus(); inp.select();
      function done(ok) { if (!inp.parentNode) return; if (ok) { var n = parseFloat(inp.value); if (isFinite(n)) set(n); } s.replaceChild(num, inp); if (unit) unit.style.display = ''; }
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
      inp.addEventListener('blur', function () { done(true); });
    }
    s.setValue = function (nv) { v = nv; show(); };
    return s;
  }

  function sw(on, onChange) {
    var s = el('span', { class: 'switch' + (on ? ' on' : ''), role: 'switch' });
    s.addEventListener('click', function (e) { e.stopPropagation(); on = !on; s.classList.toggle('on', on); onChange(on); });
    s.setOn = function (v) { on = !!v; s.classList.toggle('on', on); };
    return s;
  }

  function swatch(value, onChange) {
    var i = el('i', { style: { background: value } }), lab = el('span', { text: String(value).toUpperCase() });
    var inp = el('input', { type: 'color', value: value });
    inp.addEventListener('input', function () { i.style.background = inp.value; lab.textContent = inp.value.toUpperCase(); onChange(inp.value); });
    return el('label', { class: 'swatch' }, [i, lab, inp]);
  }

  function range(min, max, step, value, onInput) {
    var r = el('input', { type: 'range', min: min, max: max, step: step, value: value });
    function paint() { r.style.setProperty('--p', ((r.value - min) / (max - min) * 100) + '%'); }
    r.addEventListener('input', function () { paint(); onInput(Number(r.value)); });
    paint();
    r.setValue = function (v) { r.value = v; paint(); };
    return r;
  }

  /** items: [{label|icon, value, title}] */
  function seg(items, value, onChange, cls) {
    var w = el('div', { class: 'seg' + (cls ? ' ' + cls : '') });
    items.forEach(function (it) {
      var b = el('button', { title: it.title || it.label || null, class: it.value === value ? 'active' : '' });
      if (it.icon) b.appendChild(svg(it.icon)); else b.textContent = it.label;
      b.addEventListener('click', function () { $$('button', w).forEach(function (x) { x.classList.remove('active'); }); b.classList.add('active'); onChange(it.value); });
      w.appendChild(b);
    });
    return w;
  }

  /** Inspector row: label on the left, controls on the right. */
  function prop(label, controls) { return el('div', { class: 'prop' }, [el('label', { text: label }), el('div', { class: 'ctl' }, [].concat(controls))]); }

  /** Collapsible group. opts: {open, toggle: {on, onChange}, key} */
  function group(title, rows, opts) {
    var o = opts || {};
    var open = o.key ? store.get('grp.' + o.key, o.open !== false) : o.open !== false;
    var g = el('div', { class: 'group' + (open ? '' : ' closed') });
    var head = el('div', { class: 'gh' }, [svg('chevronDown'), el('span', { class: 'ttl', text: title })]);
    head.firstChild.setAttribute('class', 'chev');
    var body = el('div', { class: 'gb' }, rows);
    if (o.toggle) {
      var t = sw(o.toggle.on, function (v) { g.classList.toggle('off', !v); o.toggle.onChange(v); if (v && g.classList.contains('closed')) head.click(); });
      head.appendChild(t);
      g.classList.toggle('off', !o.toggle.on);
    }
    head.addEventListener('click', function () { var c = g.classList.toggle('closed'); if (o.key) store.set('grp.' + o.key, !c); });
    g.appendChild(head); g.appendChild(body);
    return g;
  }

  /* ---------------------------------------------------------- font picker */
  // fonts: [{group, items: [{value, label, css, weight, style}]}]
  function fontCss(it) { return { fontFamily: '"' + it.css + '", sans-serif', fontWeight: it.weight || 'normal', fontStyle: it.style || 'normal' }; }
  function fontPicker(getFonts, value, onChange) {
    var lab = el('span');
    var b = el('div', { class: 'fontpick', tabindex: 0 }, [lab, svg('chevronDown')]);
    function find(v) { var f = null; getFonts().forEach(function (g) { g.items.forEach(function (it) { if (it.value === v) f = it; }); }); return f; }
    function show() { var it = find(value); lab.textContent = it ? it.label : value; var c = it ? fontCss(it) : {}; for (var k in c) lab.style[k] = c[k]; }
    show();
    b.addEventListener('click', function () {
      var q = el('input', { class: 'input', placeholder: 'Search fonts' });
      var list = el('div', { class: 'fontlist' });
      var obs = root.IntersectionObserver ? new IntersectionObserver(function (en) {
        en.forEach(function (x) { if (x.isIntersecting && x.target._it) { var c = fontCss(x.target._it); for (var k in c) x.target.style[k] = c[k]; obs.unobserve(x.target); } });
      }, { root: list }) : null;
      function render() {
        clear(list);
        var t = q.value.trim().toLowerCase(), selEl = null;
        getFonts().forEach(function (g) {
          var items = g.items.filter(function (it) { return !t || it.label.toLowerCase().indexOf(t) >= 0; });
          if (!items.length) return;
          list.appendChild(el('div', { class: 'gt', text: g.group }));
          items.forEach(function (it) {
            var row = el('div', { class: 'it' + (it.value === value ? ' sel' : ''), text: it.label, title: it.label });
            row._it = it;
            if (obs) obs.observe(row); else { var c = fontCss(it); for (var k in c) row.style[k] = c[k]; }
            row.addEventListener('click', function () { value = it.value; show(); pop.close(); onChange(value); });
            if (it.value === value) selEl = row;
            list.appendChild(row);
          });
        });
        if (!list.children.length) list.appendChild(el('div', { class: 'gt', text: 'No fonts found' }));
        if (selEl) list.scrollTop = Math.max(0, selEl.offsetTop - 80);
      }
      q.addEventListener('input', render);
      var pop = popover(b, el('div', null, [el('div', { class: 'search' }, [svg('search'), q]), list]), { width: Math.max(220, b.offsetWidth), onClose: function () { if (obs) obs.disconnect(); } });
      render();
      q.focus();
    });
    b.setValue = function (v) { value = v; show(); };
    b.refresh = show;
    return b;
  }

  /* ---------------------------------------------------------- shared animation ticker */
  // One requestAnimationFrame loop drives every visible preview, so dozens of
  // animated cards stay smooth.
  var players = [], running = false, FPS = 24;
  var vis = root.IntersectionObserver ? new IntersectionObserver(function (en) {
    en.forEach(function (x) { var p = x.target._player; if (p) p._vis = x.isIntersecting; });
    kick();
  }, { threshold: 0.01 }) : null;
  function kick() { if (!running && players.some(function (p) { return p._vis && !p._paused; })) { running = true; root.requestAnimationFrame(loop); } }
  // round-robin with a time budget per frame: many visible cards share the
  // budget instead of freezing the panel
  var rr = 0, BUDGET = 9;
  function loop(now) {
    var any = false, t0 = root.performance.now(), n = players.length;
    for (var c = 0; c < n; c++) {
      var p = players[(rr + c) % n];
      if (!p._vis || p._paused || !p.cv.isConnected) continue;
      any = true;
      if (p._last && now - p._last < 1000 / FPS - 3) continue;
      if (root.performance.now() - t0 > BUDGET) { rr = (rr + c) % n; break; }
      if (p._start == null) p._start = now - (p._offset || 0) * 1000;
      p._last = now;
      p.draw(((now - p._start) / 1000 * (p._rate || 1)) % p.tl.total);
    }
    if (any) root.requestAnimationFrame(loop); else running = false;
  }
  var ticker = {
    add: function (player, offset) {
      player._offset = offset || 0; player._vis = !vis; player._start = null;
      player.cv._player = player;
      players.push(player);
      if (vis) vis.observe(player.cv);
      kick();
    },
    remove: function (player) { var i = players.indexOf(player); if (i >= 0) players.splice(i, 1); if (vis) vis.unobserve(player.cv); },
    clear: function (filter) { players.slice().forEach(function (p) { if (!filter || filter(p)) ticker.remove(p); }); },
    pause: function (player, on) { player._paused = on; if (!on) { player._start = null; player._last = 0; kick(); } },
    restart: function (player) { player._start = null; player._offset = 0; player._last = 0; kick(); },
    kick: kick
  };

  CQ.ui = { el: el, svg: svg, btn: btn, iconBtn: iconBtn, $: $, $$: $$, clear: clear, toast: toast, dialog: dialog, modal: dialog, popover: popover, closePop: closePop, store: store, field: field, select: select, scrub: scrub, sw: sw, swatch: swatch, color: swatch, range: range, seg: seg, prop: prop, group: group, fontPicker: fontPicker, ticker: ticker };
})(typeof window !== 'undefined' ? window : global);

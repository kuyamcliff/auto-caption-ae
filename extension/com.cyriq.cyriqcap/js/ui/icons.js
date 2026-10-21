/* CyriqCap icon set (original, 24x24 stroke icons). */
(function (root) {
  'use strict';
  var S = function (body, fill) {
    return '<svg viewBox="0 0 24 24" fill="' + (fill || 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
  };
  var I = {
    captions: S('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 13h4M13 13h4M7 16h7"/>'),
    sparkle: S('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
    help: S('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.6"/><path d="M12 17.2h.01"/>'),
    gear: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    wave: S('<path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0"/>'),
    film: S('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>'),
    layers: S('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
    text: S('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
    alert: S('<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5h.01"/>'),
    x: S('<path d="M6 6l12 12M18 6L6 18"/>'),
    check: S('<path d="M5 12.5l4.5 4.5L19 7"/>'),
    trash: S('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    play: S('<path d="M7 5l12 7-12 7z"/>', 'currentColor'),
    pause: S('<path d="M8 5v14M16 5v14"/>'),
    folder: S('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    search: S('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    refresh: S('<path d="M20 11a8 8 0 0 0-14.7-4.3L3 9"/><path d="M3 4v5h5M4 13a8 8 0 0 0 14.7 4.3L21 15"/><path d="M21 20v-5h-5"/>'),
    wand: S('<path d="M4 20L16 8M14 6l4 4M18 3v3M21 6h-3M7 4v2M8 5H6"/>'),
    font: S('<path d="M4 20l6-16h4l6 16M7 14h10"/>'),
    stop: S('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
    info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
    plug: S('<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>'),
    shield: S('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
    log: S('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>'),
    copy: S('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    plus: S('<path d="M12 5v14M5 12h14"/>'),
    merge: S('<path d="M7 4v6a5 5 0 0 0 5 5h0a5 5 0 0 1 5 5v0M17 4v4M17 4l-3 3M17 4l3 3"/>'),
    mark: '<svg viewBox="0 0 48 48"><defs><linearGradient id="cqg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a7bff"/><stop offset="1" stop-color="#17c3ff"/></linearGradient></defs>' +
      '<rect x="3" y="3" width="42" height="42" rx="12" fill="#07112a" stroke="url(#cqg)" stroke-width="2.5"/>' +
      '<path d="M31 16.5a10 10 0 1 0 0 15" fill="none" stroke="url(#cqg)" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M26 22h9M26 26.5h6" stroke="#e8f0ff" stroke-width="3" stroke-linecap="round"/></svg>'
  };
  root.CQ = root.CQ || {};
  root.CQ.icons = I;
})(typeof window !== 'undefined' ? window : global);

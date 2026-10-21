/* Icons: Lucide (https://lucide.dev), ISC License - see licenses/lucide-ISC.txt */
(function (root) {
  'use strict';
  function S(b) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + b + '</svg>'; }
  var I = {
    "captions": S("<rect width=\"18\" height=\"14\" x=\"3\" y=\"5\" rx=\"2\" ry=\"2\" /><path d=\"M7 15h4M15 15h2M7 11h2M13 11h4\" />"),
    "sparkle": S("<path d=\"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72\" /><path d=\"m14 7 3 3\" /><path d=\"M5 6v4\" /><path d=\"M19 14v4\" /><path d=\"M10 2v2\" /><path d=\"M7 8H3\" /><path d=\"M21 16h-4\" /><path d=\"M11 3H9\" />"),
    "help": S("<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\" /><path d=\"M12 17h.01\" />"),
    "gear": S("<path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\" /><circle cx=\"12\" cy=\"12\" r=\"3\" />"),
    "folder": S("<path d=\"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2\" />"),
    "check": S("<path d=\"M20 6 9 17l-5-5\" />"),
    "x": S("<path d=\"M18 6 6 18\" /><path d=\"m6 6 12 12\" />"),
    "alert": S("<circle cx=\"12\" cy=\"12\" r=\"10\" /><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\" /><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\" />"),
    "warn": S("<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\" /><path d=\"M12 9v4\" /><path d=\"M12 17h.01\" />"),
    "download": S("<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" /><polyline points=\"7 10 12 15 17 10\" /><line x1=\"12\" x2=\"12\" y1=\"15\" y2=\"3\" />"),
    "trash": S("<path d=\"M3 6h18\" /><path d=\"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6\" /><path d=\"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2\" /><line x1=\"10\" x2=\"10\" y1=\"11\" y2=\"17\" /><line x1=\"14\" x2=\"14\" y1=\"11\" y2=\"17\" />"),
    "play": S("<polygon points=\"6 3 20 12 6 21 6 3\" />"),
    "pause": S("<rect x=\"14\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\" /><rect x=\"6\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\" />"),
    "search": S("<circle cx=\"11\" cy=\"11\" r=\"8\" /><path d=\"m21 21-4.3-4.3\" />"),
    "refresh": S("<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\" /><path d=\"M21 3v5h-5\" /><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\" /><path d=\"M8 16H3v5\" />"),
    "text": S("<polyline points=\"4 7 4 4 20 4 20 7\" /><line x1=\"9\" x2=\"15\" y1=\"20\" y2=\"20\" /><line x1=\"12\" x2=\"12\" y1=\"4\" y2=\"20\" />"),
    "film": S("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /><path d=\"M7 3v18\" /><path d=\"M3 7.5h4\" /><path d=\"M3 12h18\" /><path d=\"M3 16.5h4\" /><path d=\"M17 3v18\" /><path d=\"M17 7.5h4\" /><path d=\"M17 16.5h4\" />"),
    "wave": S("<path d=\"M2 10v3\" /><path d=\"M6 6v11\" /><path d=\"M10 3v18\" /><path d=\"M14 8v7\" /><path d=\"M18 5v13\" /><path d=\"M22 10v3\" />"),
    "layers": S("<path d=\"m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z\" /><path d=\"m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65\" /><path d=\"m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65\" />"),
    "spin": S("<path d=\"M21 12a9 9 0 1 1-6.219-8.56\" />"),
    "info": S("<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"M12 16v-4\" /><path d=\"M12 8h.01\" />"),
    "chevron": S("<path d=\"m6 9 6 6 6-6\" />"),
    "filecheck": S("<path d=\"M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4\" /><path d=\"M14 2v4a2 2 0 0 0 2 2h4\" /><path d=\"m3 15 2 2 4-4\" />"),
    "drive": S("<line x1=\"22\" x2=\"2\" y1=\"12\" y2=\"12\" /><path d=\"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\" /><line x1=\"6\" x2=\"6.01\" y1=\"16\" y2=\"16\" /><line x1=\"10\" x2=\"10.01\" y1=\"16\" y2=\"16\" />"),
    "stop": S("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" />"),
    "ok": S("<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"m9 12 2 2 4-4\" />"),
    "bad": S("<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"m15 9-6 6\" /><path d=\"m9 9 6 6\" />"),
    "plug": S("<path d=\"M12 22v-5\" /><path d=\"M9 8V2\" /><path d=\"M15 8V2\" /><path d=\"M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z\" />"),
    "font": S("<path d=\"M21 14h-5\" /><path d=\"M16 16v-3.5a2.5 2.5 0 0 1 5 0V16\" /><path d=\"M4.5 13h6\" /><path d=\"m3 16 4.5-9 4.5 9\" />"),
    "log": S("<path d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\" /><path d=\"M14 2v4a2 2 0 0 0 2 2h4\" /><path d=\"M10 9H8\" /><path d=\"M16 13H8\" /><path d=\"M16 17H8\" />"),
    "copy": S("<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\" /><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\" />"),
    "wand": S("<path d=\"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72\" /><path d=\"m14 7 3 3\" /><path d=\"M5 6v4\" /><path d=\"M19 14v4\" /><path d=\"M10 2v2\" /><path d=\"M7 8H3\" /><path d=\"M21 16h-4\" /><path d=\"M11 3H9\" />"),
    "plus": S("<path d=\"M5 12h14\" /><path d=\"M12 5v14\" />"),
    "shield": S("<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" /><path d=\"m9 12 2 2 4-4\" />"),
    "alignTop": S("<rect width=\"14\" height=\"6\" x=\"5\" y=\"16\" rx=\"2\" /><rect width=\"10\" height=\"6\" x=\"7\" y=\"6\" rx=\"2\" /><path d=\"M2 2h20\" />"),
    "alignMid": S("<rect width=\"14\" height=\"6\" x=\"5\" y=\"16\" rx=\"2\" /><rect width=\"10\" height=\"6\" x=\"7\" y=\"2\" rx=\"2\" /><path d=\"M2 12h20\" />"),
    "alignBot": S("<rect width=\"14\" height=\"6\" x=\"5\" y=\"12\" rx=\"2\" /><rect width=\"10\" height=\"6\" x=\"7\" y=\"2\" rx=\"2\" /><path d=\"M2 22h20\" />"),
    "alignL": S("<path d=\"M15 12H3\" /><path d=\"M17 18H3\" /><path d=\"M21 6H3\" />"),
    "alignC": S("<path d=\"M17 12H7\" /><path d=\"M19 18H5\" /><path d=\"M21 6H3\" />"),
    "alignR": S("<path d=\"M21 12H9\" /><path d=\"M21 18H7\" /><path d=\"M21 6H3\" />"),
    "external": S("<path d=\"M15 3h6v6\" /><path d=\"M10 14 21 3\" /><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\" />"),
    "model": S("<path d=\"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z\" /><path d=\"m3.3 7 8.7 5 8.7-5\" /><path d=\"M12 22V12\" />"),
    mark: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#fff"/><path d="M20.5 11.2a6.5 6.5 0 1 0 0 9.6" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/></svg>'
  };
  root.CQ = root.CQ || {};
  root.CQ.icons = I;
})(typeof window !== 'undefined' ? window : global);

/* Panel code must run in CEP 9 (After Effects 2019): Chromium 61 + Node 8. */
'use strict';
const fs = require('fs'), path = require('path'), acorn = require('acorn');
const EXT = path.join(__dirname, '..', 'extension', 'com.cyriq.cyriqcap');
const bad = [];
function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) check(p); } }
// APIs missing in Chromium 61 / Node 8
const BANNED = [/\.flat\(/, /\.flatMap\(/, /Object\.fromEntries/, /\.matchAll\(/, /\.replaceAll\(/, /\.at\(-?\d/, /structuredClone/, /fs\.promises/, /\?\?/, /\?\.[a-zA-Z_(\[]/, /ResizeObserver/, /\.trimStart\(|\.trimEnd\(/, /Promise\.allSettled|Promise\.any/, /globalThis/];
function check(p) {
  const src = fs.readFileSync(p, 'utf8');
  try { acorn.parse(src, { ecmaVersion: 2017, sourceType: 'script' }); } catch (e) { bad.push(p + ': ES2017 syntax: ' + e.message); }
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  BANNED.forEach(r => { if (r.test(code)) bad.push(p + ': uses ' + r); });
}
walk(path.join(EXT, 'js'));
const css = fs.readFileSync(path.join(EXT, 'css', 'main.css'), 'utf8');
[/\binset\s*:/, /\bclamp\(/, /\bgap\s*:/, /aspect-ratio/, /:is\(/, /:where\(/, /backdrop-filter/, /@container/].forEach(r => { if (r.test(css.replace(/grid-(row-|column-)?gap/g, ''))) bad.push('main.css uses ' + r); });
if (bad.length) { bad.forEach(b => console.log('FAIL', b)); process.exit(1); }
console.log('compat ok (ES2017, CEP 9 APIs, CSS)');

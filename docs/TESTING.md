# Testing

```
cd tests && npm install && node run-all.js
```

- `test-compat.js`: no syntax or CSS newer than Chromium 61 / Node 8 (CEP 9).
- `test-unit.js`: timing, grouping, wrapping, builder output, preview and expression parity.
- `test-host.js`: runs `host.jsx` against an After Effects object model mock. Applies all 65 presets to several layers, re-applies, checks plug-in gating, keyframes per layer, removal and caption creation, and evaluates every generated expression.
- `test-pipeline.js <apiDir>`: real transcription on Linux builds of the same engines.
- `ui-shots.js <dir>`: renders every screen of the panel with the mock host.
- `help-shots.js <dir>`: captures the Help screenshots.

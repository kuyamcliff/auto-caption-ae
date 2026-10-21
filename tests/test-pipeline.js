/*
 * End-to-end transcription test with the real programs (Linux builds of the
 * same engines shipped for Windows).
 * Usage: node test-pipeline.js <apiDir> <media> [expectTiming]
 */
'use strict';
const path = require('path');
const EXT = path.join(__dirname, '..', 'extension', 'com.cyriq.cyriqcap');
require(path.join(EXT, 'js/core/models.js'));
require(path.join(EXT, 'js/core/captions.js'));
const S = require(path.join(EXT, 'js/services/services.js'));
const [, , apiDir, media, expect] = process.argv;
(async () => {
  const plan = { mode: 'file', range: { start: 2, end: 22 }, pieces: [{ file: path.resolve(media), at: 2, from: 5, to: 25, stretch: 100 }] };
  const stages = [];
  const job = new S.TranscriptionJob({ apiDir, model: 'small', language: 'en', plan, onProgress: p => { if (stages[stages.length - 1] !== p.label) stages.push(p.label); } });
  const r = await job.start();
  const fitted = global.CQ.captions.fitTiming(global.CQ.captions.groupWords(r.words, 'auto'), { offset: plan.range.start, compStart: 2, compEnd: 22, fps: 30 });
  console.log(JSON.stringify({ stages, words: r.words.length, timing: r.wordTiming, seconds: r.seconds.toFixed(1), sample: r.words.slice(0, 4).map(w => w.text + '@' + w.start.toFixed(2)), captions: fitted.length }));
  if (expect && r.wordTiming !== expect) { console.log('expected timing ' + expect); process.exit(1); }
  if (!fitted.length || fitted.some((c, i) => c.end <= c.start || (fitted[i + 1] && c.end > fitted[i + 1].start + 1e-6))) process.exit(1);
})().catch(e => { console.error('FAILED', e.code, S.friendly(e), e.detail); process.exit(1); });

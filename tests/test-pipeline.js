/*
 * End-to-end transcription test using the real engines (Linux builds of the
 * same programs shipped for Windows). Usage: node test-pipeline.js <apiDir> <media> [engine]
 */
'use strict';
const path = require('path');
const EXT = path.join(__dirname, '..', 'extension', 'com.cyriq.cyriqcap');
require(path.join(EXT, 'js/core/captions.js'));
const S = require(path.join(EXT, 'js/services/services.js'));
const [, , apiDir, media, engineArg] = process.argv;
(async () => {
  const engines = engineArg ? [engineArg] : ['whispercpp', 'whisperx'];
  for (const engine of engines) {
    // a "precomp" style plan: same file twice at different offsets is not useful; use a single piece + a cut range
    const plan = { mode: 'file', range: { start: 2, end: 32 }, pieces: [{ file: media, at: 2, from: 5, to: 35, stretch: 100 }] };
    const stages = [];
    const job = new S.TranscriptionJob({ apiDir, engine, language: 'en', plan, onProgress: p => { if (!stages.length || stages[stages.length - 1] !== p.state) stages.push(p.state); } });
    const t0 = Date.now();
    const r = await job.start();
    const groups = global.CQ.captions.groupWords(r.words, 'auto');
    const fitted = global.CQ.captions.fitTiming(groups, { offset: plan.range.start, compStart: 0, compEnd: 40, fps: 30 });
    console.log(JSON.stringify({ engine, stages, words: r.words.length, timing: r.wordTiming, seconds: ((Date.now() - t0) / 1000).toFixed(1), firstWords: r.words.slice(0, 4).map(w => w.text + '@' + w.start.toFixed(2)), captions: fitted.length, firstCaption: fitted[0] && { start: fitted[0].start, end: fitted[0].end, n: fitted[0].words.length } }));
    if (!r.words.length || !fitted.length) process.exit(1);
    if (fitted.some((c, i) => c.end <= c.start || (fitted[i + 1] && c.end > fitted[i + 1].start + 1e-6))) { console.log('timing invalid'); process.exit(1); }
  }
  // cancellation
  const job = new S.TranscriptionJob({ apiDir, engine: 'whispercpp', language: 'en', plan: { mode: 'file', range: { start: 0, end: 30 }, pieces: [{ file: media, at: 0, from: 0, to: 30, stretch: 100 }] }, onProgress: p => { if (p.state === 'loading' || p.state === 'transcribing') job.cancel(); } });
  try { await job.start(); console.log('cancel FAILED'); process.exit(1); } catch (e) { console.log('cancel ok:', e.code, 'temp cleaned:', !S.exists(job.tmp)); }
  // missing file
  const bad = new S.TranscriptionJob({ apiDir, engine: 'whispercpp', plan: { mode: 'file', range: { start: 0, end: 5 }, pieces: [{ file: '/nope/missing.mp4', at: 0, from: 0, to: 5, stretch: 100 }] } });
  try { await bad.start(); } catch (e) { console.log('missing file ->', e.code, '|', e.message); }
})().catch(e => { console.error('FAILED', e.code, e.message, e.detail); process.exit(1); });

/*
 * CyriqCap preset registry.
 *
 * A preset is pure data. The same object drives:
 *   - the live canvas preview (js/core/preview.js)
 *   - the After Effects build (jsx/host.jsx, via the JSON the panel sends)
 *
 * Units: positions/sizes are in pixels for a 1080px-tall composition and are
 * scaled to the real comp height when applied. Tracking is in 1/1000 em
 * (After Effects units). Colors are hex strings.
 *
 * Animator props follow After Effects text-animator semantics: the value is
 * the state at amount 100%; amount 0% is the untouched text.
 */
(function (root) {
  'use strict';

  function A(based, props, t) { return { based: based, props: props, t: t }; }
  function T(o) {
    var d = { phase: 'both', dur: 0.8, overlap: 0.35, order: 'forward', ease: 'cubicOut' };
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) d[k] = o[k];
    return d;
  }
  function glow(color, radius, intensity, extra) {
    var g = { fx: 'glow', color: color, radius: radius, intensity: intensity, threshold: 40 };
    for (var k in extra || {}) g[k] = extra[k];
    return g;
  }
  // a soft two-layer glow similar to the look of physically based glow plug-ins
  function softGlow(color, r1, r2, i1, i2) {
    return [glow(color, r1 || 14, i1 == null ? 1.1 : i1), glow(color, r2 || 60, i2 == null ? 0.7 : i2)];
  }

  var FONTS = {
    'Montserrat-Black': { css: 'Montserrat Black', file: 'Montserrat-Black.ttf' },
    'Montserrat-ExtraBold': { css: 'Montserrat ExtraBold', file: 'Montserrat-ExtraBold.ttf' },
    'Montserrat-Bold': { css: 'Montserrat Bold', file: 'Montserrat-Bold.ttf' },
    'Montserrat-Medium': { css: 'Montserrat Medium', file: 'Montserrat-Medium.ttf' },
    'Rubik-Bold': { css: 'Rubik Bold', file: 'Rubik-Bold.ttf' },
    'Rubik-Medium': { css: 'Rubik Medium', file: 'Rubik-Medium.ttf' },
    'Oswald-Bold': { css: 'Oswald Bold', file: 'Oswald-Bold.ttf' },
    'Oswald-Medium': { css: 'Oswald Medium', file: 'Oswald-Medium.ttf' },
    'CinzelRoman-Bold': { css: 'Cinzel Bold', file: 'Cinzel-Bold.ttf' },
    'Fredoka-Bold': { css: 'Fredoka Bold', file: 'Fredoka-Bold.ttf' },
    'RobotoSlab-ExtraBold': { css: 'Roboto Slab ExtraBold', file: 'RobotoSlab-ExtraBold.ttf' },
    'BebasNeue-Regular': { css: 'Bebas Neue', file: 'BebasNeue-Regular.ttf' },
    'Anton-Regular': { css: 'Anton', file: 'Anton-Regular.ttf' },
    'KaushanScript-Regular': { css: 'Kaushan Script', file: 'KaushanScript-Regular.ttf' },
    'Allura-Regular': { css: 'Allura', file: 'Allura-Regular.ttf' },
    'Bangers-Regular': { css: 'Bangers', file: 'Bangers-Regular.ttf' },
    'Righteous-Regular': { css: 'Righteous', file: 'Righteous-Regular.ttf' },
    'Poppins-SemiBold': { css: 'Poppins SemiBold', file: 'Poppins-SemiBold.ttf' },
    'Poppins-Bold': { css: 'Poppins Bold', file: 'Poppins-Bold.ttf' },
    'Poppins-Regular': { css: 'Poppins', file: 'Poppins-Regular.ttf' },
    'RacingSansOne-Regular': { css: 'Racing Sans One', file: 'RacingSansOne-Regular.ttf' }
  };

  // Third-party plug-ins a preset may need. `match` is tested (case-insensitive,
  // substring) against After Effects' installed effect display names and match names.
  var PLUGINS = {
    deepglow: { name: 'Deep Glow', vendor: 'Plugin Everything', match: ['deep glow'] },
    sapphire: { name: 'Boris FX Sapphire', vendor: 'Boris FX', match: ['s_texturenoiseemboss', 's_texturespots', 's_texturecells', 's_embossshiny', 'sapphire'] },
    bcc: { name: 'Boris FX Continuum (BCC)', vendor: 'Boris FX', match: ['bcc rays puffy', 'bcc '] }
  };

  var W = '#ffffff';
  var P = [];
  function add(p) { P.push(p); }

  /* ------------------------------------------------------------------ */
  /* Kinetic                                                              */
  /* ------------------------------------------------------------------ */
  var K = { font: 'Montserrat-Black', cat: 'Kinetic', bg: '#000000' };
  function kin(p) { for (var k in K) if (p[k] == null) p[k] = K[k]; p.style = p.style || { size: 110, fill: W, tracking: 0, caps: true }; return p; }

  add(kin({ id: 'squeeze-in', name: 'Squeeze In', sample: 'ACCORDION',
    anims: [A('chars', { tracking: 900, opacity: 0, blur: [14, 0] }, T({ dur: 0.9, overlap: 1, ease: 'expoOut', outEase: 'cubicOut', outDur: 0.5 }))] }));

  add(kin({ id: 'drop-bounce', name: 'Drop Bounce', sample: 'BOUNCE',
    anims: [A('chars', { position: [0, -420], opacity: 0, blur: [0, 40] }, T({ dur: 0.75, overlap: 0.85, ease: 'bounceOut', outEase: 'cubicOut', outDur: 0.35 }))] }));

  add(kin({ id: 'box-tilt', name: 'Box Tilt', sample: 'BOXED', style: { size: 110, fill: '#000000', tracking: 0, caps: true },
    anims: [A('chars', { opacity: 0 }, T({ dur: 0.35, overlap: 0.6, delay: 0.2, ease: 'cubicOut' }))],
    extras: [{ type: 'box', color: W, pad: [34, 18], growFrom: 'center', dur: 0.35 }],
    layer: { rotation: { keys: [[0.55, 0], [0.85, -8]], ease: 'backOut' } } }));

  add(kin({ id: 'clock-wipe', name: 'Clock Wipe', sample: 'CLOCK',
    anims: [A('chars', { opacity: 0 }, T({ dur: 0.6, overlap: 1, ease: 'linear', outDur: 0.3 }))],
    extras: [{ type: 'spinLine', color: W, width: 6, dur: 0.6 }] }));

  add(kin({ id: 'conveyor-slide', name: 'Conveyor Slide', sample: 'CONVEYOR',
    anims: [A('chars', { position: [380, 0], opacity: 0, blur: [30, 0] }, T({ dur: 0.9, overlap: 0.35, ease: 'expoOut', outOrder: 'forward', outDur: 0.5 }))] }));

  add(kin({ id: 'stretch-snap', name: 'Stretch Snap', sample: 'ELASTIC',
    anims: [A('chars', { scale: [420, 22], opacity: 0 }, T({ dur: 0.8, overlap: 0.5, order: 'random', ease: 'elasticOut', outEase: 'cubicOut', outDur: 0.4, seed: 4 }))] }));

  add(kin({ id: 'soft-type', name: 'Soft Type', sample: 'EXPAND',
    anims: [A('chars', { opacity: 0, scale: [70, 70] }, T({ dur: 0.7, overlap: 0.3, ease: 'cubicOut' }))] }));

  add(kin({ id: 'flicker-on', name: 'Flicker On', sample: 'FLICKER',
    anims: [A('chars', { opacity: 0 }, T({ dur: 0.9, overlap: 1, ease: 'step', flicker: { rate: 16, until: 1 }, outDur: 0.3, outEase: 'step', seed: 11 }))] }));

  add(kin({ id: 'outline-flood', name: 'Outline Flood', sample: 'FLOODED',
    style: { size: 110, fill: W, tracking: 0, caps: true, stroke: { color: W, width: 3 } },
    anims: [
      A('chars', { fillOpacity: 0 }, T({ phase: 'in', dur: 0.9, overlap: 0.5, delay: 0.45, ease: 'cubicOut' })),
      A('chars', { opacity: 0 }, T({ dur: 0.5, overlap: 0.4, ease: 'cubicOut', outDur: 0.35 }))
    ] }));

  add(kin({ id: 'dash-reveal', name: 'Dash Reveal', sample: 'HANGMAN',
    anims: [A('chars', { opacity: 0 }, T({ dur: 0.9, overlap: 0.15, order: 'random', ease: 'step', outDur: 0.35, seed: 5 }))],
    extras: [{ type: 'dashes', color: W, dur: 0.9 }] }));

  add(kin({ id: 'interlock', name: 'Interlock', sample: 'INTERLOCK',
    anims: [
      A('chars', { position: [0, -90], tracking: 300 }, T({ dur: 0.9, overlap: 1, ease: 'expoOut', outDur: 0.45, select: { mod: 2, eq: 1 } })),
      A('chars', { position: [0, 90], tracking: 300 }, T({ dur: 0.9, overlap: 1, ease: 'expoOut', outDur: 0.45, select: { mod: 2, eq: 0 } })),
      A('chars', { opacity: 0 }, T({ dur: 0.4, overlap: 1, ease: 'cubicOut', outDur: 0.3 }))
    ] }));

  add(kin({ id: 'frame-track', name: 'Frame Track', sample: 'OUTLINE',
    anims: [A('chars', { tracking: 520, opacity: 0 }, T({ dur: 1.1, overlap: 1, ease: 'expoOut', outDur: 0.5 }))],
    extras: [{ type: 'outlineBox', color: W, width: 5, pad: [40, 20], dur: 1.1, followTracking: true }] }));

  add(kin({ id: 'rise-up', name: 'Rise Up', sample: 'PEAK UP',
    anims: [A('chars', { position: [0, 140] }, T({ dur: 0.8, overlap: 0.4, ease: 'expoOut', outDur: 0.45 }))],
    clip: 'baseline' }));

  add(kin({ id: 'center-radiate', name: 'Center Radiate', sample: 'RADIATE',
    anims: [
      A('chars', { fill: '#3a3a3a' }, T({ dur: 1, overlap: 0.45, order: 'center', ease: 'cubicOut', outDur: 0.5 })),
      A('chars', { opacity: 0 }, T({ dur: 0.7, overlap: 0.35, order: 'center', ease: 'cubicOut', outDur: 0.4 }))
    ] }));

  add(kin({ id: 'echo-grid', name: 'Echo Grid', sample: 'REPEAT',
    anims: [A('chars', { opacity: 0, position: [0, 30] }, T({ dur: 0.6, overlap: 0.4, ease: 'cubicOut', outDur: 0.35 }))],
    extras: [{ type: 'echoRows', color: W, width: 2, rows: 2, delay: 0.5, dur: 0.6 }] }));

  add(kin({ id: 'slot-roll', name: 'Slot Roll', sample: 'ROLLING',
    anims: [A('chars', { charOffset: 14, position: [0, -60], blur: [0, 16] }, T({ dur: 1, overlap: 0.6, ease: 'cubicOut', outDur: 0.45, seed: 9 })),
      A('chars', { opacity: 0 }, T({ dur: 0.35, overlap: 0.6, ease: 'cubicOut', outDur: 0.3 }))] }));

  add(kin({ id: 'shuffle-blur', name: 'Shuffle Blur', sample: 'SHUFFLE',
    anims: [A('chars', { position: [260, 0] }, T({ dur: 0.85, overlap: 0.45, order: 'random', ease: 'expoOut', seed: 3, outDur: 0.4, sign: 'randSide' })),
      A('chars', { opacity: 0, blur: [36, 0] }, T({ dur: 0.85, overlap: 0.45, order: 'random', ease: 'expoOut', seed: 3, outDur: 0.4 }))] }));

  add(kin({ id: 'split-slice', name: 'Split Slice', sample: 'SLICED',
    anims: [A('chars', { opacity: 0 }, T({ dur: 0.3, overlap: 1, ease: 'cubicOut', outDur: 0.3 }))],
    slices: { offset: 360, dur: 0.8, ease: 'expoOut' } }));

  add(kin({ id: 'springy-pop', name: 'Springy Pop', sample: 'SPRINGY',
    anims: [A('chars', { scale: [0, 0], rotation: -25, position: [0, 40] }, T({ dur: 0.9, overlap: 0.4, ease: 'backOutStrong', outEase: 'cubicOut', outDur: 0.4 }))] }));

  add(kin({ id: 'block-uncover', name: 'Block Uncover', sample: 'UNCOVER',
    anims: [A('chars', { opacity: 0 }, T({ dur: 0.45, overlap: 0.2, delay: 0.25, ease: 'step', outDur: 0.3 }))],
    extras: [{ type: 'sweepBlock', color: W, dur: 0.8 }] }));

  add(kin({ id: 'split-lines', name: 'Split Lines', sample: 'AFTER\nEFFECTS', font: 'Montserrat-Medium', bg: '#ffffff',
    style: { size: 92, fill: '#111111', tracking: 40, caps: true, leading: 1.05 },
    anims: [A('lines', { position: [-700, 0] }, T({ dur: 0.9, overlap: 1, ease: 'expoOut', outDur: 0.5, sign: 'alt' })),
      A('lines', { blur: [24, 0], opacity: 0 }, T({ dur: 0.9, overlap: 1, ease: 'expoOut', outDur: 0.5 }))] }));

  /* ------------------------------------------------------------------ */
  /* Glow captions                                                        */
  /* ------------------------------------------------------------------ */
  add({ id: 'neon-word-pop', name: 'Neon Word Pop', cat: 'Glow', font: 'Montserrat-Bold', sample: 'HELLO GUYS', bg: '#120a24',
    style: { size: 80, fill: W, tracking: 120, caps: true },
    anims: [
      A('words', { opacity: 0, scale: [60, 60], blur: [10, 10] }, T({ dur: 0.6, overlap: 0.3, ease: 'backOut', outEase: 'cubicOut', outDur: 0.35 })),
      { based: 'words', wordColors: ['#1cff4a', W, '#ff2b2b', '#ffe100', '#2a63ff'] }
    ],
    fx: [glow('auto', 22, 1.2, { colorsFrom: 'text' }), glow('auto', 70, 0.6, { colorsFrom: 'text' })] });

  add({ id: 'blur-type-in', name: 'Blur Type In', cat: 'Glow', font: 'Montserrat-Bold', sample: 'TEXT ANIMATION', bg: '#0c0c0c',
    style: { size: 70, fill: W, tracking: 140, caps: true },
    anims: [A('chars', { opacity: 0, blur: [22, 22] }, T({ dur: 0.9, overlap: 0.3, ease: 'cubicOut', outOrder: 'forward', outDur: 0.6 }))],
    fx: softGlow(W, 12, 50, 0.9, 0.5) });

  add({ id: 'glow-flicker-fade', name: 'Glow Flicker Fade', cat: 'Glow', font: 'Montserrat-Bold', sample: 'TEXT ANIMATION', bg: '#0c0c0c',
    style: { size: 70, fill: W, tracking: 140, caps: true },
    anims: [A('chars', { opacity: 0 }, T({ dur: 1.1, overlap: 0.25, order: 'random', ease: 'cubicOut', seed: 21, outDur: 0.6 }))],
    fx: softGlow(W, 12, 55, 0.9, 0.5) });

  add({ id: 'ember-glow-text', name: 'Ember Glow Text', cat: 'Glow', font: 'Montserrat-Bold', sample: 'TEXTURE TEXT', bg: '#0c0c0c',
    style: { size: 80, fill: '#ffd9cf', tracking: 100, caps: true },
    anims: [A('chars', { opacity: 0, blur: [8, 8] }, T({ dur: 0.7, overlap: 0.5, ease: 'cubicOut', outDur: 0.5 }))],
    fx: [{ fx: 'texture', color: '#ff6a3d', amount: 0.35, scale: 30, speed: 1 }].concat(softGlow('#ff5a3c', 14, 55, 1.2, 0.8)) });

  add({ id: 'zoom-punch', name: 'Zoom Punch', cat: 'Glow', font: 'Montserrat-Bold', sample: 'OUTRO', bg: '#0c0c0c',
    style: { size: 80, fill: W, tracking: 100, caps: true },
    anims: [A('chars', { opacity: 0 }, T({ dur: 0.2, overlap: 1, ease: 'linear', outDur: 0.4 }))],
    layer: { scale: { from: 230, dur: 0.35, ease: 'expoOut' } },
    fx: softGlow(W, 16, 60, 1, 0.6) });

  add({ id: 'tint-sweep-gold', name: 'Tint Sweep Gold', cat: 'Glow', font: 'Rubik-Bold', sample: 'Cyriq text pack', bg: '#000000',
    style: { size: 72, fill: '#ff1d1d', tracking: 60, caps: false },
    anims: [
      A('chars', { fill: '#ffd400' }, T({ phase: 'loop', loopPeriod: 1.6, loopSpread: 0.35 })),
      A('chars', { opacity: 0 }, T({ dur: 0.5, overlap: 1, ease: 'cubicOut', outDur: 0.4 }))
    ],
    fx: softGlow('#ff3b1d', 10, 45, 1.1, 0.7) });

  add({ id: 'tint-sweep-ice', name: 'Tint Sweep Ice', cat: 'Glow', font: 'Rubik-Bold', sample: 'Cyriq text pack', bg: '#000000',
    style: { size: 72, fill: '#16d6ff', tracking: 60, caps: false },
    anims: [
      A('chars', { fill: '#ffffff' }, T({ phase: 'loop', loopPeriod: 1.8, loopSpread: 0.35 })),
      A('chars', { opacity: 0 }, T({ dur: 0.5, overlap: 1, ease: 'cubicOut', outDur: 0.4 }))
    ],
    fx: softGlow('#18c8ff', 10, 45, 1.1, 0.7) });

  add({ id: 'melt-drip', name: 'Melt Drip', cat: 'Glow', font: 'Rubik-Bold', sample: 'Cyriq text pack', bg: '#000000',
    style: { size: 72, fill: W, tracking: 60, caps: false },
    anims: [A('chars', { opacity: 0 }, T({ dur: 0.5, overlap: 1, ease: 'cubicOut', outDur: 0.4 }))],
    extras: [{ type: 'drip', color: W, at: 0.3, len: 70, width: 7, delay: 0.3, dur: 1.6 }],
    fx: softGlow(W, 12, 50, 1, 0.6) });

  add({ id: 'arc-slide-down', name: 'Arc Slide Down', cat: 'Glow', font: 'Rubik-Bold', sample: 'Cyriq text pack', bg: '#000000',
    style: { size: 72, fill: W, tracking: 60, caps: false },
    anims: [A('chars', { position: [160, 120], scale: [40, 40], rotation: 35, opacity: 0 }, T({ dur: 1, overlap: 0.35, ease: 'cubicOut', outDur: 0.5 }))],
    fx: softGlow(W, 12, 50, 1, 0.6) });

  add({ id: 'arc-slide-up', name: 'Arc Slide Up', cat: 'Glow', font: 'Rubik-Bold', sample: 'Cyriq text pack', bg: '#000000',
    style: { size: 72, fill: W, tracking: 60, caps: false },
    anims: [A('chars', { position: [160, -120], scale: [40, 40], rotation: -35, opacity: 0 }, T({ dur: 1, overlap: 0.35, ease: 'cubicOut', outDur: 0.5 }))],
    fx: softGlow(W, 12, 50, 1, 0.6) });

  add({ id: 'wave-slide', name: 'Wave Slide', cat: 'Glow', font: 'Rubik-Bold', sample: 'Cyriq text pack', bg: '#000000',
    style: { size: 72, fill: W, tracking: 60, caps: false },
    anims: [A('chars', { position: [180, -90], scale: [45, 45], rotation: -30, opacity: 0 }, T({ dur: 1, overlap: 0.35, ease: 'backOut', outEase: 'cubicOut', outDur: 0.5 }))],
    fx: [{ fx: 'wave', height: 10, width: 140, speed: 2, settle: 1.2 }].concat(softGlow(W, 12, 50, 1, 0.6)) });

  add({ id: 'spaced-type', name: 'Spaced Type', cat: 'Glow', font: 'Rubik-Bold', sample: 'Cyriq text pack', bg: '#000000',
    style: { size: 72, fill: W, tracking: 60, caps: false },
    anims: [
      A('chars', { opacity: 0 }, T({ dur: 0.9, overlap: 0.05, ease: 'step', outDur: 0.5, outEase: 'cubicOut', outOverlap: 1 })),
      A('chars', { tracking: 160 }, T({ dur: 1.4, overlap: 1, ease: 'cubicOut', outDur: 0.5 }))
    ],
    fx: softGlow(W, 12, 50, 1, 0.6) });

  add({ id: 'rise-stagger', name: 'Rise Stagger', cat: 'Glow', font: 'Rubik-Bold', sample: 'Cyriq text pack', bg: '#000000',
    style: { size: 72, fill: W, tracking: 60, caps: false },
    anims: [A('chars', { position: [0, 70], opacity: 0, blur: [0, 10] }, T({ dur: 0.9, overlap: 0.35, ease: 'backOut', outEase: 'cubicOut', outDur: 0.5 }))],
    fx: softGlow(W, 12, 50, 1, 0.6) });

  add({ id: 'flip-up', name: 'Flip Up', cat: 'Glow', font: 'Rubik-Bold', sample: 'Cyriq text pack', bg: '#000000',
    style: { size: 72, fill: W, tracking: 60, caps: false },
    anims: [A('chars', { position: [40, -80], rotation: 60, scale: [50, 50], opacity: 0 }, T({ dur: 0.9, overlap: 0.35, ease: 'backOut', outEase: 'cubicOut', outDur: 0.5 }))],
    fx: softGlow(W, 12, 50, 1, 0.6) });

  add({ id: 'glow-fade', name: 'Glow Fade', cat: 'Glow', font: 'Poppins-SemiBold', sample: 'fade in\nand fade out', bg: '#000000',
    style: { size: 60, fill: W, tracking: 150, caps: false, leading: 1.1 },
    anims: [A('words', { opacity: 0, blur: [6, 6] }, T({ dur: 0.9, overlap: 0.4, ease: 'cubicOut', outDur: 0.7 }))],
    fx: softGlow('#2f8bff', 12, 60, 1.3, 0.9) });

  add({ id: 'random-fade-up', name: 'Random Fade Up', cat: 'Glow', font: 'Poppins-SemiBold', sample: 'Random fade up\nRANDOM FADE OUT', bg: '#000000',
    style: { size: 58, fill: '#f4ff2a', tracking: 150, caps: false, leading: 1.1 },
    anims: [A('chars', { opacity: 0, position: [0, 18] }, T({ dur: 1.1, overlap: 0.25, order: 'random', ease: 'cubicOut', seed: 33, outDur: 0.7 }))],
    fx: softGlow('#e6ff00', 12, 50, 1.2, 0.7) });

  add({ id: 'bouncy-neon', name: 'Bouncy Neon', cat: 'Glow', font: 'KaushanScript-Regular', sample: 'Bouncy Text', bg: '#000000',
    style: { size: 80, fill: '#fff0fb', tracking: 80, caps: false },
    anims: [A('chars', { position: [0, -90], opacity: 0, scale: [70, 130] }, T({ dur: 0.9, overlap: 0.4, ease: 'bounceOut', outEase: 'cubicOut', outDur: 0.45 }))],
    fx: softGlow('#ff3fd2', 10, 45, 1.4, 0.9) });

  add({ id: 'line-reveal', name: 'Line Reveal', cat: 'Glow', font: 'Poppins-SemiBold', sample: 'Text\nREVEAL', bg: '#000000',
    style: { size: 64, fill: W, tracking: 120, caps: false, leading: 1.0, lineColors: [W, '#ff4f7b'] },
    anims: [A('chars', { position: [0, 50], opacity: 0 }, T({ dur: 0.7, overlap: 1, delay: 0.35, ease: 'expoOut', outDur: 0.4 }))],
    extras: [{ type: 'line', color: W, width: 3, dur: 0.4, at: 'bottom' }],
    clip: 'baseline',
    fx: softGlow('#ff2e63', 12, 50, 1.2, 0.8) });

  add({ id: 'underline-swoosh', name: 'Underline Swoosh', cat: 'Glow', font: 'Oswald-Medium', sample: "Let's Hit\n-100K SUBS-", bg: '#000000',
    style: { size: 72, fill: '#ffe23f', tracking: 120, caps: false, leading: 1.05, lineColors: [W, '#ffe23f'] },
    anims: [A('words', { opacity: 0, position: [0, 20] }, T({ dur: 1, overlap: 0.4, ease: 'cubicOut', outDur: 0.5 }))],
    extras: [{ type: 'swoosh', color: '#ffffff', width: 5, delay: 0.7, dur: 0.5 }],
    fx: softGlow('#ffd000', 8, 35, 0.9, 0.5) });

  add({ id: 'golden-script-wipe', name: 'Golden Script Wipe', cat: 'Glow', font: 'KaushanScript-Regular', sample: 'Subscribe', bg: '#1b1b1b',
    style: { size: 96, fill: '#ffc94a', tracking: 160, caps: false },
    anims: [A('chars', { opacity: 0, blur: [10, 0], position: [-30, 0] }, T({ dur: 0.9, overlap: 0.4, ease: 'cubicOut', outDur: 0.5 }))],
    fx: [{ fx: 'ramp', c1: '#fff1b0', c2: '#ff9a1c', dir: 'vertical' }].concat(softGlow('#ffb200', 10, 40, 1, 0.6)) });

  add({ id: 'cyan-mixed-glitch', name: 'Cyan Mixed Glitch', cat: 'Glow', font: 'Fredoka-Bold', sample: "let's HIT\n100K SUBS!", bg: '#0b0f14',
    style: { size: 70, fill: '#d9fbff', tracking: 40, caps: false, leading: 1.0 },
    anims: [
      A('chars', { opacity: 0 }, T({ dur: 0.8, overlap: 0.2, order: 'random', ease: 'step', flicker: { rate: 20, until: 1 }, seed: 8, outDur: 0.35 })),
      A('chars', { fill: '#2fe6ff', position: [0, -10] }, T({ phase: 'hold', jitter: { rate: 6, prob: 0.35 } }))
    ],
    fx: softGlow('#21dcff', 10, 45, 1.3, 0.8) });

  add({ id: 'pop-count', name: 'Pop Count', cat: 'Glow', font: 'Fredoka-Bold', sample: '100', bg: '#0b0f14',
    style: { size: 140, fill: '#bff6ff', tracking: 40, caps: false },
    anims: [
      A('chars', { scale: [0, 0], opacity: 0 }, T({ dur: 0.7, overlap: 0.3, ease: 'backOutStrong', outEase: 'cubicOut', outDur: 0.4 })),
      A('chars', { fill: '#ff2a55' }, T({ phase: 'hold', jitter: { rate: 4, prob: 0.25 } }))
    ],
    fx: softGlow('#14d8ff', 14, 55, 1.4, 0.9) });

  add({ id: 'chrome-slice', name: 'Chrome Slice', cat: 'Glow', font: 'Fredoka-Bold', sample: "let's hit 100k\nSUBSCRIBERS", bg: '#000000',
    style: { size: 70, fill: '#cfe3ff', tracking: 120, caps: false, leading: 1.0 },
    anims: [A('chars', { opacity: 0, position: [80, 0] }, T({ dur: 0.6, overlap: 0.6, order: 'random', ease: 'step', flicker: { rate: 24, until: 1 }, seed: 13, outDur: 0.35 }))],
    fx: [{ fx: 'ramp', c1: '#f2f8ff', c2: '#2e6bff', dir: 'vertical' }, { fx: 'sliceJitter', amount: 40, until: 0.7 }].concat(softGlow('#5b8cff', 8, 40, 0.9, 0.5)) });

  add({ id: 'red-laser-cut', name: 'Red Laser Cut', cat: 'Glow', font: 'Oswald-Bold', sample: 'CUT CUT CUT', bg: '#000000',
    style: { size: 90, fill: '#ff2a44', tracking: 120, caps: true },
    anims: [A('chars', { opacity: 0, scale: [100, 0] }, T({ dur: 0.7, overlap: 0.3, ease: 'expoOut', delay: 0.15, outDur: 0.4 }))],
    extras: [{ type: 'laserLines', color: '#ff1f3d', count: 3, dur: 0.5 }],
    fx: softGlow('#ff0a2a', 10, 45, 1.5, 0.9) });

  /* ------------------------------------------------------------------ */
  /* Titles                                                               */
  /* ------------------------------------------------------------------ */
  add({ id: 'ember-reveal', name: 'Ember Reveal', cat: 'Titles', font: 'CinzelRoman-Bold', sample: 'Text Animation\nCYRIQ TEXT', bg: '#050505',
    style: { size: 64, fill: '#ffb36b', tracking: 260, caps: false, leading: 1.05, lineColors: ['#fff3e6', '#ff8a2a'] },
    anims: [A('chars', { opacity: 0, blur: [10, 10] }, T({ dur: 1.2, overlap: 0.35, ease: 'cubicOut', outDur: 0.8, outOrder: 'random' }))],
    extras: [{ type: 'dashline', color: '#ffb36b', width: 2, delay: 0.5, dur: 0.6 }],
    fx: softGlow('#ff6a00', 14, 70, 1.6, 1) });

  add({ id: 'ember-chevron', name: 'Ember Chevron', cat: 'Titles', font: 'Righteous-Regular', sample: 'TEXT ANIMATION\nCYRIQ TEXT', bg: '#050505',
    style: { size: 64, fill: '#ffd07a', tracking: 80, caps: true, leading: 1.0, lineColors: ['#fff1d6', '#ff9c2b'] },
    anims: [A('chars', { position: [0, -70], opacity: 0, scale: [100, 160] }, T({ dur: 0.9, overlap: 0.35, order: 'random', ease: 'backOut', outEase: 'cubicOut', outDur: 0.6, seed: 19 }))],
    extras: [{ type: 'chevrons', color: '#ffb35c', width: 3, delay: 0.3, dur: 0.6 }],
    fx: [{ fx: 'texture', color: '#ff7a00', amount: 0.3, scale: 18, speed: 2 }].concat(softGlow('#ff6a00', 14, 70, 1.6, 1)) });

  add({ id: 'ember-scatter', name: 'Ember Scatter', cat: 'Titles', font: 'RacingSansOne-Regular', sample: 'Text Animation\nCYRIQ TEXT', bg: '#050505',
    style: { size: 70, fill: '#ffd3a1', tracking: 120, caps: false, leading: 1.0, lineColors: ['#ffffff', '#ff9a3c'] },
    anims: [A('chars', { position: [0, 160], rotation: 40, opacity: 0, blur: [0, 18] }, T({ dur: 1, overlap: 0.4, order: 'random', ease: 'expoOut', outDur: 0.6, seed: 27 }))],
    extras: [{ type: 'dashline', color: '#ffcf9a', width: 2, delay: 0.6, dur: 0.5 }],
    fx: softGlow('#ff6200', 14, 70, 1.6, 1) });

  add({ id: 'violet-split', name: 'Violet Split', cat: 'Titles', font: 'Bangers-Regular', sample: 'CYRIQ\nTEXT ANIMATION', bg: '#05030a',
    style: { size: 90, fill: '#c9a9ff', tracking: 60, caps: true, leading: 0.95, lineColors: ['#ffffff', '#b58cff'] },
    anims: [A('chars', { rotation: 180, scale: [0, 0], opacity: 0 }, T({ dur: 0.8, overlap: 0.4, order: 'random', ease: 'backOut', outEase: 'cubicOut', outDur: 0.45, seed: 41 }))],
    fx: [{ fx: 'rgbSplit', amount: 7 }].concat(softGlow('#7a3cff', 14, 70, 1.5, 1)) });

  add({ id: 'copper-wave', name: 'Copper Wave', cat: 'Titles', font: 'Righteous-Regular', sample: '<<CYRIQ>>\nTEXT ANIMATION', bg: '#060504',
    style: { size: 62, fill: '#ffc89a', tracking: 90, caps: true, leading: 1.0, lineColors: ['#ffffff', '#ffc89a'] },
    anims: [
      A('chars', { tracking: 260, opacity: 0 }, T({ dur: 1.2, overlap: 1, ease: 'expoOut', outDur: 0.6 })),
      A('chars', { position: [0, -24] }, T({ phase: 'loop', loopPeriod: 2.2, loopSpread: 0.25 }))
    ],
    fx: softGlow('#ff8a3a', 12, 60, 1.2, 0.8) });

  add({ id: 'magenta-slide', name: 'Magenta Slide', cat: 'Titles', font: 'RobotoSlab-ExtraBold', sample: 'TEXT ANIMATION\nby cyriq', bg: '#06030a',
    style: { size: 64, fill: '#ff3be0', tracking: 60, caps: false, leading: 1.0, lineColors: ['#ffffff', '#ff3be0'] },
    anims: [A('words', { position: [-140, 0], opacity: 0, skew: -18, blur: [20, 0] }, T({ dur: 0.9, overlap: 0.4, ease: 'expoOut', outDur: 0.5 }))],
    extras: [{ type: 'line', color: '#ff3be0', width: 3, dur: 0.5, delay: 0.5, at: 'bottom' }],
    fx: softGlow('#ff10c8', 14, 70, 1.5, 1) });

  /* ------------------------------------------------------------------ */
  /* Cinematic & effects                                                  */
  /* ------------------------------------------------------------------ */
  var C = { cat: 'Cinematic', font: 'BebasNeue-Regular', bg: '#000000' };
  function cin(p) { for (var k in C) if (p[k] == null) p[k] = C[k]; p.style = p.style || { size: 130, fill: W, tracking: 40, caps: true }; return p; }

  add(cin({ id: 'deep-glow', name: 'Deep Glow', sample: 'YOUR TEXT', needs: ['deepglow'],
    anims: [A('chars', { opacity: 0, blur: [12, 12] }, T({ dur: 0.7, overlap: 0.4, ease: 'cubicOut', outDur: 0.4 }))],
    fx: [{ fx: 'plugin', plugin: 'deepglow', params: { Radius: 300, Exposure: 0.9 } }, { fx: 'shadow', color: '#000000', opacity: 100, distance: 0, softness: 30 }, { fx: 'shadow', color: '#000000', opacity: 60, distance: 0, softness: 80 }] }));

  add(cin({ id: 'tracking-bevel', name: 'Tracking Bevel', sample: 'YOUR TEXT', style: { size: 130, fill: '#ff2a2a', tracking: 40, caps: true },
    anims: [A('chars', { tracking: -60, opacity: 0 }, T({ phase: 'in', dur: 0.6, overlap: 1, ease: 'cubicOut' })),
      A('chars', { tracking: 160 }, T({ phase: 'drift' }))],
    fx: [{ fx: 'bevel', thickness: 3, angle: -45, intensity: 0.6 }].concat(softGlow('#ff1a1a', 10, 40, 0.8, 0.5)) }));

  add(cin({ id: 'gradient-glow', name: 'Gradient Glow', sample: 'YOUR TEXT',
    anims: [A('chars', { opacity: 0, position: [0, 30] }, T({ dur: 0.7, overlap: 0.4, ease: 'expoOut', outDur: 0.4 }))],
    fx: [{ fx: 'ramp', c1: '#ff1e2d', c2: '#ffffff', dir: 'vertical' }].concat(softGlow('#ff2a3a', 12, 55, 1.1, 0.7)) }));

  add(cin({ id: 'noise-emboss', name: 'Noise Emboss', sample: 'YOUR TEXT', needs: ['sapphire'], style: { size: 130, fill: '#d11a2a', tracking: 40, caps: true },
    anims: [A('chars', { opacity: 0 }, T({ dur: 0.6, overlap: 0.5, ease: 'cubicOut', outDur: 0.4 }))],
    fx: [{ fx: 'plugin', plugin: 'sapphire', effect: 'S_TextureNoiseEmboss', previewAs: 'emboss', color: '#ff2a3a' }, { fx: 'shadow', color: '#000000', opacity: 80, distance: 6, softness: 12 }] }));

  add(cin({ id: 'explosion', name: 'Explosion', sample: 'YOUR TEXT',
    anims: [{ based: 'chars', scatter: [620, 420], t: T({ dur: 1, overlap: 0.5, order: 'random', ease: 'expoOut', outDur: 0.8, seed: 17 }) },
      A('chars', { rotation: 220, scale: [400, 400], opacity: 0, blur: [6, 6] }, T({ dur: 1, overlap: 0.5, order: 'random', ease: 'expoOut', outDur: 0.8, seed: 17 }))],
    fx: softGlow(W, 10, 45, 0.9, 0.5) }));

  add(cin({ id: 'handwriting', name: 'Handwriting', font: 'Allura-Regular', sample: 'Your Name', style: { size: 150, fill: W, tracking: 0, caps: false },
    anims: [A('chars', { opacity: 0 }, T({ phase: 'out', dur: 0.4, overlap: 1, outDur: 0.4 }))],
    write: { dur: 1.8, width: 6 },
    fx: softGlow(W, 8, 30, 0.6, 0.3) }));

  add(cin({ id: 'burn-film', name: 'Burn Film', sample: 'CC BURN', style: { size: 140, fill: W, tracking: 60, caps: true },
    fx: [{ fx: 'burn', dur: 0.9, outDur: 0.9 }].concat(softGlow('#ff5a2a', 10, 45, 0.9, 0.5)) }));

  add(cin({ id: 'shatter', name: 'Shatter', sample: 'SHATTER', style: { size: 140, fill: W, tracking: 40, caps: true },
    anims: [A('chars', { opacity: 0, blur: [14, 14] }, T({ phase: 'in', dur: 0.5, overlap: 0.6, ease: 'cubicOut' }))],
    fx: [{ fx: 'shatter', outDur: 1.2 }].concat(softGlow(W, 10, 40, 0.8, 0.4)) }));

  add(cin({ id: 'texture-spots', name: 'Texture Spots', sample: 'TEXT', needs: ['sapphire'], style: { size: 150, fill: '#ff2a3a', tracking: 40, caps: true },
    anims: [A('chars', { opacity: 0 }, T({ dur: 0.6, overlap: 0.5, ease: 'cubicOut', outDur: 0.4 }))],
    fx: [{ fx: 'plugin', plugin: 'sapphire', effect: 'S_TextureSpots', previewAs: 'spots', color: '#ff2a3a' }].concat(softGlow('#ff1a2a', 10, 40, 0.8, 0.4)) }));

  add(cin({ id: 'texture-cells', name: 'Texture Cells', sample: 'TEXT', needs: ['sapphire'], style: { size: 150, fill: '#3a7bff', tracking: 40, caps: true },
    anims: [A('chars', { opacity: 0 }, T({ dur: 0.6, overlap: 0.5, ease: 'cubicOut', outDur: 0.4 }))],
    fx: [{ fx: 'plugin', plugin: 'sapphire', effect: 'S_TextureCells', previewAs: 'cells', color: '#3a7bff' }].concat(softGlow('#2a6bff', 10, 40, 0.8, 0.4)) }));

  add(cin({ id: 'rotating-fade', name: 'Rotating Fade', font: 'Anton-Regular', sample: "I'M A\nSERIAL KILLER", style: { size: 90, fill: W, tracking: 60, caps: true, leading: 0.95 },
    anims: [
      A('chars', { opacity: 0, position: [0, 25] }, T({ dur: 1.4, overlap: 0.3, order: 'random', ease: 'cubicOut', seed: 48, outDur: 0.6 })),
      A('chars', { rotation: 16 }, T({ phase: 'hold', wiggle: { amount: 16, settle: 6, freq: 2 } })),
      A('chars', { tracking: 250 }, T({ dur: 1.6, overlap: 1, ease: 'cubicOut', outDur: 0.6 }))
    ] }));

  add(cin({ id: 'blood-texture', name: 'Blood Texture', font: 'Anton-Regular', sample: "I'M A\nSERIAL KILLER", needs: ['sapphire', 'bcc'], style: { size: 90, fill: '#c4001a', tracking: 60, caps: true, leading: 0.95, lineColors: ['#ffffff', '#c4001a'] },
    anims: [A('chars', { opacity: 0, position: [0, 25] }, T({ dur: 1.2, overlap: 0.3, order: 'random', ease: 'cubicOut', seed: 48, outDur: 0.6 }))],
    fx: [{ fx: 'texture', color: '#ff1a2a', amount: 0.55, scale: 22, speed: 0.6 },
      { fx: 'plugin', plugin: 'sapphire', effect: 'S_EmbossShiny', previewAs: 'emboss', color: '#ff3040' },
      { fx: 'plugin', plugin: 'bcc', effect: 'BCC Rays Puffy', previewAs: 'rays', color: '#ff2030' }] }));

  add(cin({ id: 'bracket-frame', name: 'Bracket Frame', font: 'Poppins-SemiBold', sample: 'WHO AM I?', style: { size: 80, fill: W, tracking: 40, caps: true },
    anims: [A('chars', { opacity: 0, blur: [4, 4] }, T({ dur: 0.8, overlap: 0.4, ease: 'cubicOut', outDur: 0.4 }))],
    extras: [{ type: 'brackets', color: W, width: 3, pad: [26, 16], delay: 0.15, dur: 0.5 }],
    layer: { scale: { from: 112, dur: 0.6, ease: 'expoOut' } },
    fx: [glow('#7fd6ff', 14, 0.9), glow('#7fd6ff', 50, 0.5, { flash: '#ff2040' })] }));

  add(cin({ id: 'pixel-glitch', name: 'Pixel Glitch', font: 'Anton-Regular', sample: 'JESUS\nCHRIST', style: { size: 100, fill: W, tracking: 40, caps: true, leading: 0.95 },
    anims: [A('chars', { opacity: 0, position: [60, 0] }, T({ dur: 0.7, overlap: 0.5, order: 'random', ease: 'step', flicker: { rate: 18, until: 1 }, seed: 6, outDur: 0.4 }))],
    fx: [{ fx: 'mosaic', blocks: 18, dur: 0.7 }, { fx: 'rgbSplit', amount: 6, until: 0.9 }, { fx: 'sliceJitter', amount: 50, until: 0.8 }].concat(softGlow(W, 8, 35, 0.6, 0.3)) }));

  var CATEGORIES = ['All', 'Kinetic', 'Glow', 'Titles', 'Cinematic'];

  /* Expand authoring shortcuts into plain animators (shared by preview and AE). */
  function normalize(p) {
    var out = [];
    (p.anims || []).forEach(function (a) {
      if (a.wordColors) {
        a.wordColors.forEach(function (c, j) {
          out.push({ based: a.based, props: { fill: c }, t: { phase: 'hold', select: { mod: a.wordColors.length, eq: j } } });
        });
      } else if (a.scatter) {
        var t1 = {}, t2 = {}, k;
        for (k in a.t) { t1[k] = a.t[k]; t2[k] = a.t[k]; }
        t1.sign = 'rand'; t1.signSeed = 211; t2.sign = 'rand'; t2.signSeed = 377;
        out.push({ based: a.based, props: { position: [a.scatter[0], 0] }, t: t1 });
        out.push({ based: a.based, props: { position: [0, a.scatter[1]] }, t: t2 });
      } else {
        out.push(a);
      }
    });
    return out;
  }

  function byId(id) { for (var i = 0; i < P.length; i++) if (P[i].id === id) return P[i]; return null; }

  function validate(p) {
    var errs = [];
    if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) errs.push('bad id');
    if (!p.name) errs.push('missing name');
    if (!FONTS[p.font]) errs.push('unknown font ' + p.font);
    if (CATEGORIES.indexOf(p.cat) < 1) errs.push('bad category');
    (p.needs || []).forEach(function (n) { if (!PLUGINS[n]) errs.push('unknown plugin ' + n); });
    normalize(p).forEach(function (a, i) {
      if (['chars', 'charsNoSpace', 'words', 'lines'].indexOf(a.based) < 0) errs.push('anim ' + i + ' bad basedOn');
      if (!a.props || !Object.keys(a.props).length) errs.push('anim ' + i + ' no props');
    });
    return errs;
  }

  var api = { list: P, byId: byId, normalize: normalize, FONTS: FONTS, PLUGINS: PLUGINS, CATEGORIES: CATEGORIES, validate: validate };
  root.CQ = root.CQ || {};
  root.CQ.presets = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);

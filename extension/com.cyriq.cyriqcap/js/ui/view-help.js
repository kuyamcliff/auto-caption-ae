/*
 * Help tab: short steps with screenshots of the panel.
 * Arrows: {n, from:[x,y], to:[x,y]} in % of the image. The number badge sits
 * at "from" and the arrow points at "to". Step n in the list matches badge n.
 */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui, el = U.el;

  var SECTIONS = [
    {
      id: 'setup', title: 'First launch',
      img: 'help/setup.png',
      arrows: [{ n: 1, from: [88, 18], to: [70, 24] }, { n: 2, from: [90, 56], to: [76, 56] }, { n: 3, from: [88, 92], to: [72, 92] }],
      steps: ['Click <b>Choose API Folder</b> and select the <b>CyriqCap-API</b> folder you unzipped.', 'Every file is checked. Each group turns green when it is complete.', 'Click <b>Continue</b>. You only do this once.']
    },
    {
      id: 'generate', title: 'Generate captions',
      img: 'help/captions.png',
      arrows: [{ n: 1, from: [92, 12], to: [76, 12] }, { n: 2, from: [8, 30], to: [20, 30] }, { n: 3, from: [92, 30], to: [80, 30] }, { n: 4, from: [92, 42], to: [76, 42] }],
      steps: ['In the timeline, select the layer with the voice: audio, video with sound, or a precomp.', 'Choose a <b>Model</b>. <b>Small</b> is installed. Larger models are more accurate but slower.', 'Choose the <b>Language</b> or leave <b>Auto detect</b>.', 'Click <b>Generate Captions</b>. Everything runs offline on your PC.']
    },
    {
      id: 'models', title: 'Download more models',
      img: 'help/models.png',
      arrows: [{ n: 1, from: [92, 50], to: [80, 50] }],
      steps: ['Click <b>Download</b> next to a model. It is saved in your API folder and appears in the Model list when it finishes.', 'Open this list with the download icon next to <b>Model</b>, or in <b>Settings › Models</b>.']
    },
    {
      id: 'edit', title: 'Edit the transcript',
      img: 'help/transcript.png',
      arrows: [{ n: 1, from: [92, 14], to: [78, 14] }, { n: 2, from: [92, 48], to: [74, 48] }, { n: 3, from: [6, 62], to: [14, 54] }],
      steps: ['Choose how many words each caption shows. <b>Auto</b> breaks at pauses and sentence ends.', 'Click a caption to fix the text.', 'Change the start and end times if needed (<b>mm:ss:ff</b>).']
    },
    {
      id: 'style', title: 'Style and create',
      img: 'help/style.png',
      arrows: [{ n: 1, from: [92, 14], to: [78, 18] }, { n: 2, from: [92, 46], to: [78, 46] }, { n: 3, from: [92, 60], to: [78, 60] }, { n: 4, from: [92, 94], to: [76, 94] }],
      steps: ['The preview updates as you change settings.', 'Set font, size, colors and stroke.', 'Choose <b>Position</b> (top, middle or bottom) and alignment.', 'Click <b>Create Text Layers</b>. One text layer is created per caption. <b>Ctrl+Z</b> removes them all.']
    },
    {
      id: 'animate', title: 'Animate text layers',
      img: 'help/animate.png',
      arrows: [{ n: 1, from: [92, 6], to: [78, 6] }, { n: 2, from: [8, 66], to: [18, 62] }, { n: 3, from: [92, 92], to: [76, 92] }],
      steps: ['Select one or more text layers in the timeline.', 'Click a preset to preview it.', 'Click <b>Apply</b>. Keyframes are placed at the start and end of each layer. Applying again replaces the previous animation.']
    },
    {
      id: 'plugins', title: 'Presets that need plug-ins',
      img: 'help/plugin.png',
      arrows: [{ n: 1, from: [90, 40], to: [76, 46] }],
      steps: ['Some presets use <b>Deep Glow</b>, <b>Sapphire</b> or <b>BCC</b>. If the plug-in is not installed, CyriqCap shows which one is needed and does not change your project.']
    },
    {
      id: 'fonts', title: 'Fonts',
      img: 'help/settings.png',
      arrows: [{ n: 1, from: [92, 66], to: [76, 66] }],
      steps: ['Open <b>Settings</b> and click <b>Install Fonts</b>. No admin rights are needed.', 'Restart After Effects once so the fonts appear in the Character panel.']
    },
    {
      id: 'trouble', title: 'Problems', img: null,
      steps: [
        '<b>No audio found</b>: select a layer that has sound, or a precomp with audible layers.',
        '<b>Media file missing</b>: relink the footage in After Effects.',
        '<b>Wrong font</b>: Settings › Install Fonts, then restart After Effects.',
        '<b>Files missing</b>: Settings › Check Files shows what is missing. Copy the API folder again.',
        '<b>Logs</b>: Settings › About › Logs. Logs never contain your transcript.'
      ]
    }
  ];

  var NS = 'http://www.w3.org/2000/svg';
  function arrows(sec) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'ov'); s.setAttribute('viewBox', '0 0 100 100'); s.setAttribute('preserveAspectRatio', 'none');
    var h = '';
    (sec.arrows || []).forEach(function (a) {
      var dx = a.to[0] - a.from[0], dy = a.to[1] - a.from[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
      // start the line just outside the badge
      var sx = a.from[0] + dx / len * 3, sy = a.from[1] + dy / len * 3;
      h += '<line x1="' + sx + '" y1="' + sy + '" x2="' + a.to[0] + '" y2="' + a.to[1] + '" stroke="#f59e0b" vector-effect="non-scaling-stroke" style="stroke-width:2px"/>';
      h += '<circle cx="' + a.to[0] + '" cy="' + a.to[1] + '" r=".9" fill="#f59e0b"/>';
    });
    s.innerHTML = h;
    return s;
  }

  function shot(sec) {
    if (!sec.img) return null;
    var gen = CQ.helpArrows && CQ.helpArrows[sec.img.replace(/^help\/|\.png$/g, '')];
    if (gen) sec.arrows = gen;
    var wrap = el('div', { class: 'shot' }, [el('img', { src: sec.img, alt: '' })]);
    wrap.appendChild(arrows(sec));
    (sec.arrows || []).forEach(function (a) { wrap.appendChild(el('span', { class: 'pin', text: String(a.n), style: { left: a.from[0] + '%', top: a.from[1] + '%' } })); });
    return wrap;
  }

  function build(rootEl) {
    rootEl.classList.add('help');
    SECTIONS.forEach(function (s, i) {
      rootEl.appendChild(el('div', { class: 'section', id: 'help-' + s.id }, [
        el('h4', null, [el('span', { class: 'n', text: String(i + 1) }), s.title]),
        shot(s),
        el('ol', null, s.steps.map(function (t) { return el('li', { html: t }); }))
      ]));
    });
  }

  CQ.help = { build: build, onShow: function () {}, SECTIONS: SECTIONS };
})(typeof window !== 'undefined' ? window : global);

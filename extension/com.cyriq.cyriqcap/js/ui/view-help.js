/*
 * Help tab: step-by-step guide with real screenshots of the panel and
 * numbered arrows. Callout coordinates are percentages of the image.
 */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui, el = U.el;

  // arrow: [fromX, fromY] -> [toX, toY] in %, label at the arrow start
  var SECTIONS = [
    {
      id: 'setup', title: 'First launch: choose the API folder',
      img: 'help/onboarding.png',
      arrows: [{ from: [80, 62], to: [52, 87], n: 1, label: 'Click' }, { from: [86, 30], to: [62, 47], n: 2, label: 'All green' }],
      steps: ['Unzip <b>CyriqCap-API</b> anywhere on your PC (for example <b>Documents</b>).', 'Click <b>Choose API Folder</b> and pick that folder.', 'Wait for every check to turn <b>green</b>, then click <b>Continue</b>.', 'You only do this once. The pill at the top right shows <b>Offline ready</b>.']
    },
    {
      id: 'fonts', title: 'Install the fonts (once)',
      img: 'help/settings.png',
      arrows: [{ from: [86, 20], to: [62, 24], n: 1, label: 'Install' }],
      steps: ['Open <b>Settings</b>.', 'Click <b>Install Fonts</b>. No admin rights are needed.', 'Restart After Effects so the fonts appear in presets and in the Character panel.']
    },
    {
      id: 'select', title: 'Select your clip in the timeline',
      img: 'help/ae-timeline.png',
      arrows: [{ from: [84, 18], to: [42, 63], n: 1, label: 'Click the layer' }],
      steps: ['In the After Effects <b>timeline</b>, click the layer with the voice: an <b>audio</b> layer, a <b>video with sound</b> or a <b>precomp</b>.', 'Select only <b>one</b> source layer.']
    },
    {
      id: 'generate', title: 'Generate the transcript',
      img: 'help/captions-source.png',
      arrows: [{ from: [80, 10], to: [52, 14], n: 1, label: 'Your layer' }, { from: [84, 33], to: [58, 31], n: 2, label: 'Engine + language' }, { from: [80, 52], to: [52, 43], n: 3, label: 'Click' }],
      steps: ['Open <b>Auto Caption</b>. Your selected layer shows at the top.', '<b>WhisperX</b> gives the most precise word timing. <b>Whisper.cpp</b> is faster.', 'Choose a <b>language</b> or leave <b>Auto detect</b>.', 'Click <b>Generate Captions</b>. You can <b>Cancel</b> at any time.']
    },
    {
      id: 'edit', title: 'Check and edit the transcript',
      img: 'help/captions-transcript.png',
      arrows: [{ from: [84, 14], to: [60, 21], n: 1, label: 'Words per caption' }, { from: [86, 44], to: [62, 40], n: 2, label: 'Edit text' }, { from: [6, 64], to: [12, 46], n: 3, label: 'Times' }],
      steps: ['Pick how many words each caption shows: <b>Auto</b>, <b>1</b>, <b>2</b>, <b>4</b>, <b>5</b> or <b>Custom</b> (1–20).', '<b>Auto</b> breaks at sentence ends, pauses longer than 0.6 s, or when a caption would pass the line length.', 'Click any caption to fix spelling. Change the in/out times (<b>mm:ss:ff</b>) if needed.', 'The trash icon removes a caption. Nothing is added to your project yet.']
    },
    {
      id: 'style', title: 'Style your captions',
      img: 'help/captions-style.png',
      arrows: [{ from: [86, 8], to: [60, 16], n: 1, label: 'Live preview' }, { from: [86, 40], to: [60, 38], n: 2, label: 'Font & colors' }, { from: [8, 62], to: [16, 56], n: 3, label: 'Position' }, { from: [86, 88], to: [60, 86], n: 4, label: 'Animation' }],
      steps: ['Every change shows in the <b>preview</b> right away.', 'Set <b>font</b>, <b>size</b>, <b>fill</b>, <b>stroke</b>, <b>tracking</b> and <b>case</b>.', 'Click a square in the <b>position</b> grid, then fine-tune with <b>Offset X/Y</b>.', 'Optional: <b>background box</b>, <b>word highlight</b> and an <b>animation</b> from the Text Animation tab.']
    },
    {
      id: 'create', title: 'Create the text layers',
      img: 'help/captions-create.png',
      arrows: [{ from: [80, 70], to: [55, 92], n: 1, label: 'Click' }],
      steps: ['Click <b>Create Text Layers</b>.', 'One text layer per caption appears above your clip, named <b>Caption 001</b>, <b>Caption 002</b>, …', 'Press <b>Ctrl+Z</b> once to undo all of them.']
    },
    {
      id: 'animate', title: 'Animate any text layer',
      img: 'help/animate.png',
      arrows: [{ from: [16, 4], to: [30, 9], n: 1, label: 'Search' }, { from: [8, 40], to: [20, 32], n: 2, label: 'Pick a preset' }, { from: [94, 6], to: [84, 22], n: 3, label: 'Preview' }, { from: [94, 86], to: [84, 92], n: 4, label: 'Apply' }],
      steps: ['Select one or more <b>text layers</b> in the timeline. The pill shows how many.', 'Open <b>Text Animation</b> and click a preset. It plays in the big preview.', 'Type your own words in <b>Preview text</b>, change the <b>speed</b> and colors.', 'Click <b>Apply</b>. Applying again replaces the previous CyriqCap animation. <b>Remove</b> takes it off.']
    },
    {
      id: 'plugins', title: 'Presets that need plug-ins',
      img: 'help/plugin-missing.png',
      arrows: [{ from: [84, 30], to: [62, 45], n: 1, label: 'What is missing' }],
      steps: ['Presets marked <b>Deep Glow</b>, <b>Sapphire</b> or <b>BCC</b> use third-party plug-ins.', 'If a plug-in is not installed, CyriqCap tells you which one and changes nothing.', 'After installing a plug-in, click <b>Re-scan plug-ins</b> or <b>Settings › Plug-ins › Scan</b>.']
    },
    {
      id: 'trouble', title: 'Troubleshooting', img: null,
      steps: [
        '<b>"Layer has no audio"</b>: select a layer that has sound, or a precomp with audible layers.',
        '<b>"Media file missing"</b>: relink the footage in After Effects.',
        '<b>"A library is missing"</b>: install the Microsoft Visual C++ Redistributable (x64).',
        '<b>Wrong font in AE</b>: Settings › Install Fonts, then restart After Effects.',
        '<b>API incomplete</b>: Settings › Full check shows which files are missing; copy the API folder again.',
        '<b>Logs</b>: Settings › Open logs. Logs never contain your transcript.'
      ]
    }
  ];

  function arrowSvg(a, i) {
    var id = 'ah' + i;
    return '<defs><marker id="' + id + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#ff8a1a"/></marker></defs>' +
      '<line x1="' + a.from[0] + '" y1="' + a.from[1] + '" x2="' + a.to[0] + '" y2="' + a.to[1] + '" stroke="#ff8a1a" stroke-width="0.7" vector-effect="non-scaling-stroke" style="stroke-width:3px" marker-end="url(#' + id + ')" />' +
      '<circle cx="' + a.to[0] + '" cy="' + a.to[1] + '" r="1.6" fill="none" stroke="#ffb35c" style="stroke-width:2px" vector-effect="non-scaling-stroke"><animate attributeName="r" values="1.2;3;1.2" dur="1.6s" repeatCount="indefinite"/></circle>';
  }

  function shot(sec) {
    if (!sec.img) return null;
    var wrap = el('div', { class: 'shot' }, [el('img', { src: sec.img, alt: sec.title })]);
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ov'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = (sec.arrows || []).map(arrowSvg).join('');
    wrap.appendChild(svg);
    (sec.arrows || []).forEach(function (a, i) {
      var c = el('span', { class: 'callout', text: a.n + '  ' + a.label, style: { left: a.from[0] + '%', top: a.from[1] + '%', animationDelay: (0.2 + i * 0.15) + 's' } });
      wrap.appendChild(c);
    });
    return wrap;
  }

  function build(rootEl) {
    var toc = el('div', { class: 'help-toc' });
    SECTIONS.forEach(function (s, i) {
      toc.appendChild(el('a', { class: 'chip', href: '#', text: (i + 1) + '. ' + s.title.split(':')[0], onclick: function (e) { e.preventDefault(); var t = document.getElementById('help-' + s.id); if (t) rootEl.scrollTop = t.offsetTop - 10; } }));
    });
    rootEl.appendChild(el('div', { class: 'card' }, [el('h3', { text: 'Guide' }), toc]));
    SECTIONS.forEach(function (s, i) {
      rootEl.appendChild(el('div', { class: 'card help-step', id: 'help-' + s.id }, [
        el('h4', null, [el('span', { class: 'n', text: String(i + 1) }), s.title]),
        shot(s),
        el('ol', null, s.steps.map(function (t) { return el('li', { html: t }); }))
      ]));
    });
  }

  CQ.help = { build: build, onShow: function () {}, SECTIONS: SECTIONS };
})(typeof window !== 'undefined' ? window : global);

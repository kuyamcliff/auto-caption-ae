/*
 * Help tab: short steps with screenshots of the panel.
 * Arrow data comes from js/ui/help-arrows.js (generated with the screenshots):
 * {n, from:[x,y], to:[x,y]} in % of the image; badge n matches step n.
 */
(function (root) {
  'use strict';
  var CQ = root.CQ;
  var U = CQ.ui, el = U.el;

  var SECTIONS = [
    { id: 'setup', title: 'First launch', img: 'help/setup.png',
      steps: ['Click <b>Choose API Folder</b> and pick the <b>CyriqCap-API</b> folder. It is checked instantly and you are ready.'] },
    { id: 'generate', title: 'Generate captions', img: 'help/generate.png',
      steps: ['Select the layer with the voice in the timeline. It shows here.', 'Pick a <b>model</b>. Download more with the arrow button.', 'Pick the <b>language</b> or leave <b>Auto detect</b>.', 'Click <b>Generate Captions</b>. Everything runs on your PC.'] },
    { id: 'edit', title: 'Edit the transcript', img: 'help/edit.png',
      steps: ['Choose how many <b>words</b> each caption shows. <b>Auto</b> splits at pauses and sentence ends.', 'Click a caption to fix the text.', 'Change a start or end time by typing it (<b>mm:ss:ff</b>).'] },
    { id: 'style', title: 'Style and create', img: 'help/style.png',
      steps: ['The preview uses your composition size and updates live.', 'Every setting is grouped: <b>Text</b>, <b>Color</b>, <b>Position</b>, <b>Background</b>, <b>Word highlight</b>, <b>Animation</b>. Drag the blue numbers to change them.', 'Click <b>Create Text Layers</b>. Each caption starts when the voice starts and ends when it stops. <b>Ctrl+Z</b> removes them all.'] },
    { id: 'animate', title: 'Animate text layers', img: 'help/animate.png',
      steps: ['Select one or more text layers in the timeline.', 'Click a preset. Every preview plays live.', 'Click <b>Apply</b> (or double-click a preset). Keyframes sit at the start and end of each layer.'] },
    { id: 'plugins', title: 'Presets with plug-ins', img: 'help/plugins.png',
      steps: ['Presets with the plug icon need <b>Deep Glow</b>, <b>Sapphire</b> or <b>BCC</b>. If one is missing, CyriqCap tells you which and changes nothing.'] },
    { id: 'settings', title: 'Settings', img: 'help/settings.png',
      steps: ['Click the gear for <b>Settings</b>.', 'Download more <b>models</b> into your API folder.', 'Install the <b>fonts</b> once, then restart After Effects.'] },
    { id: 'trouble', title: 'Problems', img: null,
      steps: [
        '<b>No sound found</b>: select a layer that has audio, or a precomp with audible layers.',
        '<b>Media file missing</b>: relink the footage in After Effects.',
        '<b>Wrong font</b>: Settings › Install Fonts, then restart After Effects.',
        '<b>Logs</b>: Settings › About › Logs. Logs never contain your transcript.'
      ] }
  ];

  var NS = 'http://www.w3.org/2000/svg';
  function shot(sec) {
    if (!sec.img) return null;
    var arrows = (CQ.helpArrows && CQ.helpArrows[sec.id]) || [];
    var wrap = el('div', { class: 'shot' }, [el('img', { src: sec.img, alt: '' })]);
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'ov'); s.setAttribute('viewBox', '0 0 100 100'); s.setAttribute('preserveAspectRatio', 'none');
    var h = '';
    arrows.forEach(function (a) {
      var dx = a.to[0] - a.from[0], dy = a.to[1] - a.from[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
      h += '<line x1="' + (a.from[0] + dx / len * 2.5) + '" y1="' + (a.from[1] + dy / len * 2.5) + '" x2="' + a.to[0] + '" y2="' + a.to[1] + '" stroke="#f5a524" vector-effect="non-scaling-stroke" style="stroke-width:1.5px"/>';
    });
    s.innerHTML = h;
    wrap.appendChild(s);
    arrows.forEach(function (a) { wrap.appendChild(el('span', { class: 'pin', text: String(a.n), style: { left: a.from[0] + '%', top: a.from[1] + '%' } })); });
    return wrap;
  }

  function build(rootEl) {
    var sc = el('div', { class: 'scroll help' });
    SECTIONS.forEach(function (s, i) {
      sc.appendChild(el('div', { class: 'step', id: 'help-' + s.id }, [
        el('h4', null, [el('span', { class: 'n', text: String(i + 1) }), s.title]),
        shot(s),
        el('ol', null, s.steps.map(function (t) { return el('li', { html: t }); }))
      ]));
    });
    rootEl.appendChild(sc);
  }

  CQ.help = { build: build, onShow: function () {}, SECTIONS: SECTIONS };
})(typeof window !== 'undefined' ? window : global);

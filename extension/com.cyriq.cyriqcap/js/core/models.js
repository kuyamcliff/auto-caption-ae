/*
 * Speech models CyriqCap can use. Each model can exist in two formats inside
 * the API folder; CyriqCap uses whichever is present and combines them:
 *   ggml  -> models/ggml-<id>.bin              (fast transcription)
 *   ct2   -> models/faster-whisper-<id>/        (transcription + word alignment)
 * Downloads are pinned to a fixed revision and checked by size and SHA-256.
 * All weights: OpenAI Whisper, MIT License.
 */
(function (root) {
  'use strict';
  var GG = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/';
  function ct2(repo, rev, model) {
    var b = 'https://huggingface.co/' + repo + '/resolve/' + rev + '/';
    return [
      { name: 'config.json', url: b + 'config.json' },
      { name: 'model.bin', url: b + 'model.bin', size: model[0], sha256: model[1] },
      { name: 'tokenizer.json', url: b + 'tokenizer.json', size: 2203239 },
      { name: 'vocabulary.txt', url: b + 'vocabulary.txt', size: 459861 }
    ];
  }
  var MODELS = [
    { id: 'tiny', name: 'Tiny', tag: 'Fastest',
      ggml: { url: GG + 'ggml-tiny.bin', size: 77691713, sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21' },
      ct2: ct2('Systran/faster-whisper-tiny', 'd90ca5fe260221311c53c58e660288d3deb8d356', [75538270, 'dcb76c6586fc06cbdac6dd21f14cfd129cc4cdd9dce19bf4ffa62e59cbe6e6d1']) },
    { id: 'base', name: 'Base', tag: 'Fast',
      ggml: { url: GG + 'ggml-base.bin', size: 147951465, sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe' },
      ct2: ct2('Systran/faster-whisper-base', 'ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66', [145217532, 'd01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9']) },
    { id: 'small', name: 'Small', tag: 'Recommended', bundled: true,
      ggml: { url: GG + 'ggml-small.bin', size: 487601967, sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b' } },
    { id: 'medium', name: 'Medium', tag: 'More accurate',
      ggml: { url: GG + 'ggml-medium.bin', size: 1533763059, sha256: '6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208' },
      ct2: ct2('Systran/faster-whisper-medium', '08e178d48790749d25932bbc082711ddcfdfbc4f', [1527906378, '9b45e1009dcc4ab601eff815b61d80e60ce3fd8c74c1a14f4a282258286b51ae']) },
    { id: 'large-v3-turbo', name: 'Large Turbo', tag: 'Most accurate',
      ggml: { url: GG + 'ggml-large-v3-turbo.bin', size: 1624555275, sha256: '1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69' } }
  ];

  function byId(id) { for (var i = 0; i < MODELS.length; i++) if (MODELS[i].id === id) return MODELS[i]; return null; }
  function downloadSize(m) {
    var s = m.ggml ? m.ggml.size : 0;
    (m.ct2 || []).forEach(function (f) { s += f.size || 3000; });
    return s;
  }
  function fmtSize(b) { return b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.round(b / 1e6) + ' MB'; }

  var api = { list: MODELS, byId: byId, downloadSize: downloadSize, fmtSize: fmtSize, DEFAULT: 'small' };
  root.CQ = root.CQ || {};
  root.CQ.models = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);

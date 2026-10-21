/* Whisper language codes offered in the panel (Whisper supports ~99; these are the common ones). */
(function (root) {
  'use strict';
  var L = [
    ['auto', 'Auto detect'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'],
    ['nl', 'Dutch'], ['ru', 'Russian'], ['uk', 'Ukrainian'], ['pl', 'Polish'], ['tr', 'Turkish'], ['ar', 'Arabic'], ['hi', 'Hindi'],
    ['bn', 'Bengali'], ['ur', 'Urdu'], ['fa', 'Persian'], ['id', 'Indonesian'], ['ms', 'Malay'], ['tl', 'Tagalog'], ['vi', 'Vietnamese'],
    ['th', 'Thai'], ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean'], ['sv', 'Swedish'], ['no', 'Norwegian'], ['da', 'Danish'],
    ['fi', 'Finnish'], ['el', 'Greek'], ['cs', 'Czech'], ['ro', 'Romanian'], ['hu', 'Hungarian'], ['he', 'Hebrew'], ['sw', 'Swahili'],
    ['yo', 'Yoruba'], ['ha', 'Hausa'], ['af', 'Afrikaans'], ['ca', 'Catalan'], ['hr', 'Croatian'], ['sr', 'Serbian'], ['sk', 'Slovak'],
    ['bg', 'Bulgarian'], ['ta', 'Tamil'], ['te', 'Telugu'], ['ml', 'Malayalam'], ['mr', 'Marathi'], ['pa', 'Punjabi'], ['ne', 'Nepali']
  ];
  root.CQ = root.CQ || {};
  root.CQ.languages = L.map(function (x) { return { code: x[0], name: x[1] }; });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CQ.languages;
})(typeof window !== 'undefined' ? window : global);

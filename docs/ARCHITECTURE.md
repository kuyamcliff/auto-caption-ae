# Architecture

## Panel (`extension/com.cyriq.cyriqcap`)

- `CSXS/manifest.xml`: host AEFT 16.0 and newer, CEP 9, Node.js enabled (`--enable-nodejs --mixed-context`).
- `js/core/`: logic shared by the preview and After Effects.
  - `expr.js`: one timing model, compiled to After Effects expressions and to preview functions.
  - `presets.js`: the 65 presets, fonts and plug-in requirements.
  - `builder.js`: turns a preset and options into the payload `host.jsx` applies.
  - `preview.js`: canvas renderer used for cards, the detail preview and the caption style preview.
  - `captions.js`: word grouping, timing and line wrapping.
  - `models.js`: model catalog with pinned download URLs, sizes and SHA-256.
- `js/services/services.js` (Node): API folder check, audio extraction, transcription, model downloads, font install, logs.
- `js/ui/`: views (Captions, Animate, Help, Settings), the setup screen and the model manager.
- `jsx/host.jsx` (ExtendScript, ES3): reads the selection, collects audio, creates caption layers, applies and removes presets in one undo group.

The panel is written in ES2017 so it runs in the Chromium 61 and Node 8 that ship with After Effects 2019.

## Keyframes

Every preset adds two sliders to the layer: `CQ In` (0 to 100 from the layer's in-point) and `CQ Out` (0 to 100 ending at its out-point). Animator expressions read these sliders, so the animation follows the layer when it is trimmed. Moving the keys changes the timing. Keys are compressed for very short layers.

## Transcription

The user picks only a model and a language. `TranscriptionJob` chooses the best path automatically:

1. The model has WhisperX files and the Python runtime works: WhisperX transcribes and aligns words.
2. Otherwise whisper.cpp transcribes; WhisperX aligns the words when available.
3. Otherwise whisper.cpp word timing is used.

Each step falls back to the next when it fails. Errors are mapped to short messages (`services.friendly`); details go to the log only.

## API folder

`cyriqcap-api.json` lists every file with its group, size and SHA-256. On first launch the setup screen checks every file and shows each group's status. Later launches do a quick size check.

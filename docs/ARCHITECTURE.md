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

1. The model has WhisperX files and the Python runtime works: WhisperX transcribes and aligns words. The runner ships with the panel (`runner/run_whisperx.py`, called with `--api <folder>`) and adds a short punctuated prompt per language so punctuation is kept.
2. Otherwise whisper.cpp transcribes with DTW token timestamps (`--dtw <model> -nfa`); WhisperX aligns the words when available.
3. Otherwise whisper.cpp DTW timing is used (measured within about 0.05 s of WhisperX).

Each step falls back to the next when it fails. The Python runtime is started once in the background after setup; if it cannot start, the panel goes straight to whisper.cpp. The runtime gets `KMP_DUPLICATE_LIB_OK=TRUE` (torch and ctranslate2 both ship `libiomp5md.dll`), writable caches in the temp folder and no telemetry.

After transcription, word edges are snapped to the voice using a speech-energy pass over the WAV (`captions.speechRegions` / `snapWords`). Captions start at the first word and end at the last word plus a short tail, so they clear during pauses. Auto grouping splits at sentence ends and pauses, then splits long phrases with a cost model: balanced length, breaks at commas and pauses, never ending on words like "the" or "to". Errors are mapped to short messages (`services.friendly`); details go to the log only.

## API folder

`cyriqcap-api.json` lists every file with its group, size and SHA-256. The panel checks only the ~60 files each part needs to start (by size), which takes a few milliseconds. Picking the parent folder works too: the CyriqCap-API folder inside it is found automatically.

## Captions in After Effects

Each caption is a point text layer named `Caption 001`, `Caption 002`, ... stacked in order above the source layer. Its anchor point is set once from the text bounds on the side facing the chosen edge (top, middle or bottom; left, center or right), so every caption keeps the same margin. Sizes are given for a 1080 px short side and scale with the composition.

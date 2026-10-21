# CyriqCap

Auto captions and text animation presets for Adobe After Effects (2019 and newer, Windows).

- **Captions**: select an audio, video or precomp layer, transcribe offline, edit the transcript, style it and create one text layer per caption.
- **Animate**: 65 text animation presets with live previews. Apply to any number of selected text layers; keyframes are placed at each layer's start and end.
- **Offline**: transcription runs on the user's PC from a separate API folder (ffmpeg, whisper.cpp, Python runtime with WhisperX on CPU, models). Extra models download from the panel into that folder.

## Repository layout

| Path | What it is |
| --- | --- |
| `extension/com.cyriq.cyriqcap` | The CEP panel (HTML/JS UI, ExtendScript host, fonts, help images) |
| `api/` | Source parts of the API folder (`whisperx/run_whisperx.py`, docs) |
| `packaging/build_api.py` | Builds `dist/CyriqCap-API` with a size + SHA-256 manifest |
| `packaging/installer/` | `Install CyriqCap.bat`, `Uninstall CyriqCap.bat`, user README |
| `packaging/compose_help.py` | Turns raw panel screenshots into the Help images and arrow data |
| `tests/` | Unit, host (After Effects mock), compatibility, pipeline and screenshot scripts |
| `docs/` | Preset catalog, architecture, building and testing notes |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/BUILDING.md](docs/BUILDING.md) and [docs/TESTING.md](docs/TESTING.md).

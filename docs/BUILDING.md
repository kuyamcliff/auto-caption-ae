# Building

## Dependencies (into one folder, e.g. `~/dl`)

- `whisper-bin-x64.zip`: whisper.cpp v1.9.2 Windows x64 CPU build
- `ffmpeg-master-latest-win64-lgpl.zip`: FFmpeg LGPL build
- `python-3.11.9-embed-amd64.zip`: CPython embeddable
- `winsite/`: Windows site-packages for WhisperX, built with uv:

  ```
  uv pip install --target winsite --python-platform x86_64-pc-windows-msvc --python-version 3.11 \
    "whisperx==3.8.6" --extra-index-url https://download.pytorch.org/whl/cpu --index-strategy unsafe-best-match
  ```
- `models/faster-whisper-small/`, `models/align/wav2vec2_fairseq_base_ls960_asr_ls960.pth`, `models/nltk_data/`
- `ggml-small.bin`

## API folder

```
python3 packaging/build_api.py --deps ~/dl --out dist
```

The output is `dist/CyriqCap-API` with `cyriqcap-api.json`.

## Help images

```
cd tests && node help-shots.js /tmp/helpraw
python3 ../packaging/compose_help.py /tmp/helpraw ../extension/com.cyriq.cyriqcap
```

## Release folder

```
CyriqCap-1.0.0/
  Install CyriqCap.bat
  Uninstall CyriqCap.bat
  README.txt
  com.cyriq.cyriqcap/
  CyriqCap-API/
```

The panel is unsigned. The installer sets `PlayerDebugMode` for CSXS 9 to 13 so After Effects loads it.

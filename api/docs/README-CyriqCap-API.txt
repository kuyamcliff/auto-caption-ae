CyriqCap API folder (Windows x64)
=================================

This folder holds everything CyriqCap needs to transcribe audio offline.
Transcription never uses the internet. The panel only goes online when you
click Download on a model; that model is then saved in the models folder here.

How to use
1. Put this whole folder somewhere permanent, e.g. Documents\CyriqCap-API.
2. Open After Effects > Window > Extensions > CyriqCap.
3. On first launch click "Choose API Folder" and select this folder.

Contents
  bin\ffmpeg.exe                 audio extraction/conversion (FFmpeg, LGPL build)
  whisper.cpp\                   Whisper.cpp engine (whisper-cli.exe + DLLs)
  models\ggml-small.bin          Whisper Small multilingual model for Whisper.cpp
  python\                        private Python 3.11 runtime with WhisperX (CPU)
  whisperx\run_whisperx.py       CyriqCap's WhisperX runner
  models\faster-whisper-small\   Whisper Small multilingual model for WhisperX
  models\align\                  English word-alignment model (wav2vec2)
  models\nltk_data\              sentence-splitting data used by alignment
  models\ggml-<name>.bin and
  models\faster-whisper-<name>\  extra models you download from the panel
  licenses\                      licenses and notices of everything above
  cyriqcap-api.json              file list with sizes and SHA-256 checksums

Do not rename or move files inside this folder. If something goes wrong,
Settings > Check Files in the panel shows exactly which file is missing or
damaged; copy the folder again from the download.

Requirements: Windows 10 1809 or later, 64-bit. The Microsoft Visual C++
Redistributable (x64) is normally already installed with After Effects.

"""
CyriqCap WhisperX runner (offline, CPU). Ships with the panel and uses the
runtime and models in the API folder given by --api.

Adds a short punctuated prompt per language so the transcript keeps its
punctuation (WhisperX's batched decoding often drops it), which gives
better caption breaks.

Invoked by the After Effects panel with an argument list (never a shell).
Progress is written to stdout as lines starting with "@@" followed by JSON.
The result (or a structured error) is written to --out as JSON.

No network access: the panel sets HF_HUB_OFFLINE / TRANSFORMERS_OFFLINE and
every model is loaded from the API folder.
"""
import argparse
import json
import os
import sys
import time
import traceback
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
API = os.path.dirname(HERE)

# short, natural, punctuated text in each language
PROMPTS = {
    "en": "Hello, and welcome back. Today, we're going to look at this. Okay? Let's go!",
    "es": "Hola, y bienvenidos. Hoy vamos a ver esto. ¿Listos? ¡Vamos!",
    "fr": "Bonjour, et bienvenue. Aujourd'hui, on va voir ça. D'accord ? C'est parti !",
    "de": "Hallo, und willkommen zurück. Heute schauen wir uns das an. Okay? Los geht's!",
    "pt": "Olá, e bem-vindos. Hoje, vamos ver isso. Certo? Vamos lá!",
    "it": "Ciao, e bentornati. Oggi vediamo questo. Pronti? Andiamo!",
    "nl": "Hallo, en welkom terug. Vandaag gaan we dit bekijken. Oké? Daar gaan we!",
    "pl": "Cześć, witajcie ponownie. Dzisiaj zobaczymy to. Gotowi? Zaczynamy!",
    "tr": "Merhaba, tekrar hoş geldiniz. Bugün buna bakacağız. Tamam mı? Başlayalım!",
    "id": "Halo, dan selamat datang kembali. Hari ini, kita akan melihat ini. Oke? Ayo!",
    "tl": "Hello, at maligayang pagbabalik. Ngayon, titingnan natin ito. Okay? Tara na!",
    "ru": "Привет, и добро пожаловать. Сегодня мы посмотрим на это. Готовы? Поехали!",
}


def emit(stage, pct=None, **extra):
    msg = {"stage": stage}
    if pct is not None:
        msg["pct"] = round(max(0.0, min(1.0, float(pct))), 4)
    msg.update(extra)
    sys.stdout.write("@@" + json.dumps(msg) + "\n")
    sys.stdout.flush()


def write_out(path, data):
    tmp = path + ".part"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


def fail(out, code, step, message, hint=""):
    write_out(out, {"error": message, "code": code, "step": step, "hint": hint})
    sys.exit(3)


def load_wav(path):
    import numpy as np
    with wave.open(path, "rb") as w:
        if w.getsampwidth() != 2:
            raise ValueError("expected 16-bit PCM")
        rate = w.getframerate()
        ch = w.getnchannels()
        data = w.readframes(w.getnframes())
    audio = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        audio = audio.reshape(-1, ch).mean(axis=1)
    if rate != 16000:
        raise ValueError("expected 16 kHz audio, got %d" % rate)
    return audio


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default=None, help="CTranslate2 faster-whisper model folder")
    ap.add_argument("--segments", default=None, help="JSON segments to align (skip transcription)")
    ap.add_argument("--language", default="auto")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--no-align", action="store_true")
    ap.add_argument("--api", default=None, help="CyriqCap API folder")
    a = ap.parse_args()
    global API
    if a.api:
        API = a.api

    out = a.out
    t0 = time.time()
    emit("loading", 0.0)
    try:
        import torch  # noqa: F401
        torch.set_num_threads(max(1, a.threads))
        import whisperx
        from whisperx.alignment import DEFAULT_ALIGN_MODELS_TORCH
    except Exception as e:  # missing DLL, broken runtime ...
        fail(out, "PYTHON_BROKEN", "loading", "The WhisperX runtime could not start: %s" % e,
             "")

    if not a.segments and (not a.model or not os.path.isfile(os.path.join(a.model, "model.bin"))):
        fail(out, "MODEL_MISSING", "loading", "The model folder is missing.", "Re-check the API folder in Settings.")

    try:
        audio = load_wav(a.audio)
    except Exception as e:
        fail(out, "BAD_AUDIO", "loading", "The prepared audio could not be read: %s" % e, "Try again.")

    lang = None if a.language in ("", "auto") else a.language
    if a.segments:
        # alignment only: segments come from another transcriber (whisper.cpp)
        with open(a.segments, encoding="utf-8") as f:
            segments = [{"start": float(x["start"]), "end": float(x["end"]), "text": x["text"]} for x in json.load(f) if x.get("text")]
        language = lang or "en"
        aligned = False
        if language in DEFAULT_ALIGN_MODELS_TORCH and segments:
            emit("aligning", 0.0)
            model_a, meta = whisperx.load_align_model(language_code=language, device="cpu", model_dir=os.path.join(API, "models", "align"))
            res_a = whisperx.align(segments, model_a, meta, audio, "cpu", return_char_alignments=False)
            segments = res_a.get("segments") or segments
            aligned = True
        emit("writing", 1.0)
        write_out(out, {"language": language, "segments": clean_segments(segments), "aligned": aligned, "seconds": round(time.time() - t0, 2)})
        return
    try:
        model = whisperx.load_model(a.model, "cpu", compute_type="int8", language=lang,
                                    threads=max(1, a.threads), local_files_only=True,
                                    vad_method="pyannote")
    except Exception as e:
        fail(out, "MODEL_LOAD", "loading", "The WhisperX model could not be loaded: %s" % e,
             "Run a full check of the API folder in Settings.")

    if lang is None:
        try:
            lang = model.detect_language(audio)
        except Exception:
            lang = None
    if lang in PROMPTS:
        try:
            from dataclasses import replace
            model.options = replace(model.options, initial_prompt=PROMPTS[lang])
        except Exception:
            pass

    emit("transcribing", 0.0)

    def on_progress(p):
        try:
            emit("transcribing", float(p) / 100.0 if p > 1 else float(p))
        except Exception:
            pass

    try:
        result = model.transcribe(audio, batch_size=a.batch, language=lang, progress_callback=on_progress)
    except TypeError:
        result = model.transcribe(audio, batch_size=a.batch, language=lang)
    except MemoryError:
        fail(out, "NO_MEMORY", "transcribing", "Not enough memory for WhisperX.", "")

    language = result.get("language") or lang or "en"
    segments = result.get("segments") or []
    aligned = False

    if segments and not a.no_align and language in DEFAULT_ALIGN_MODELS_TORCH:
        align_dir = os.path.join(API, "models", "align")
        try:
            emit("aligning", 0.0)
            model_a, meta = whisperx.load_align_model(language_code=language, device="cpu", model_dir=align_dir)
            res_a = whisperx.align(segments, model_a, meta, audio, "cpu", return_char_alignments=False)
            segments = res_a.get("segments") or segments
            aligned = True
            emit("aligning", 1.0)
        except Exception as e:
            # alignment is optional: keep segment timing and say so
            emit("aligning", 1.0, warning="alignment unavailable: %s" % type(e).__name__)

    emit("writing", 1.0)
    write_out(out, {"language": language, "segments": clean_segments(segments), "aligned": aligned,
                    "seconds": round(time.time() - t0, 2)})


def clean_segments(segments):
    clean = []
    for s in segments:
        words = []
        for w in s.get("words") or []:
            item = {"word": w.get("word", "")}
            if "start" in w and "end" in w:
                item["start"] = float(w["start"])
                item["end"] = float(w["end"])
            if "score" in w:
                item["score"] = float(w["score"])
            words.append(item)
        clean.append({"start": float(s.get("start", 0)), "end": float(s.get("end", 0)),
                      "text": s.get("text", ""), "words": words})
    return clean


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # last resort: structured error, no transcript content
        try:
            idx = sys.argv.index("--out")
            write_out(sys.argv[idx + 1], {"error": "WhisperX failed: %s" % e, "code": "WHISPERX",
                                          "step": "transcribing", "hint": "",
                                          "trace": traceback.format_exc()[-1500:]})
        except Exception:
            pass
        sys.exit(4)

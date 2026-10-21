#!/usr/bin/env python3
"""
Assemble the CyriqCap API folder for Windows x64.

Inputs (downloaded by packaging/fetch_deps.sh into --deps):
  whisper-bin-x64.zip                 whisper.cpp official Windows CPU build
  ffmpeg-master-latest-win64-lgpl.zip ffmpeg (LGPL build)
  python-3.11.9-embed-amd64.zip       CPython embeddable distribution
  winsite/                            site-packages for WhisperX (uv, win_amd64, cp311, CPU torch)
  models/faster-whisper-small, models/align/*.pth, models/nltk_data
  ggml-small.bin                      Whisper Small multilingual (whisper.cpp format)

Output: <out>/CyriqCap-API with cyriqcap-api.json (size + SHA-256 for every file)
and a size report.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import time
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = "1.0.0"

# files never needed at runtime (build/link artefacts, tests, caches)
DROP_DIRS = {"__pycache__", "tests", "test", "testing", "include", "torchgen", "benchmarks", "examples", "docs"}
KEEP_TEST_PKGS = {"torch/testing"}  # torch imports torch.testing at import time
DROP_SUFFIX = (".lib", ".pdb", ".pyc", ".a", ".h", ".hpp", ".cuh", ".cmake")
GGML_SMALL_SHA1 = "55356645c2b361a969dfd0ef2c5a50d530afd8d5"


def log(*a):
    print("[build_api]", *a, flush=True)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()


def sha1(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()


def copytree_filtered(src, dst):
    dropped = 0
    for base, dirs, files in os.walk(src):
        rel = os.path.relpath(base, src).replace("\\", "/")
        keep_dirs = []
        for d in dirs:
            r = (rel + "/" + d).lstrip("./")
            if d in DROP_DIRS and not any(r.endswith(k) for k in KEEP_TEST_PKGS):
                dropped += 1
                continue
            keep_dirs.append(d)
        dirs[:] = keep_dirs
        os.makedirs(os.path.join(dst, rel), exist_ok=True)
        for f in files:
            if f.endswith(DROP_SUFFIX):
                dropped += 1
                continue
            shutil.copy2(os.path.join(base, f), os.path.join(dst, rel, f))
    return dropped


def group_for(rel):
    if rel.startswith("bin/"):
        return "ffmpeg"
    if rel.startswith("whisper.cpp/"):
        return "whispercpp"
    if rel == "models/ggml-small.bin":
        return "model-ggml-small"
    if rel.startswith("python/"):
        return "python"
    if rel.startswith("whisperx/"):
        return "whisperx"
    if rel.startswith("models/faster-whisper-small/"):
        return "model-faster-whisper-small"
    if rel.startswith("models/align/"):
        return "model-align-en"
    if rel.startswith("models/nltk_data/"):
        return "data"
    return "docs"


def collect_python_licenses(site, out_dir):
    rows = []
    for d in sorted(os.listdir(site)):
        if not d.endswith(".dist-info"):
            continue
        meta = os.path.join(site, d, "METADATA")
        name, ver, lic = d[:-10], "", ""
        if os.path.exists(meta):
            with open(meta, encoding="utf-8", errors="replace") as f:
                for line in f:
                    if line.startswith("Name:"):
                        name = line.split(":", 1)[1].strip()
                    elif line.startswith("Version:"):
                        ver = line.split(":", 1)[1].strip()
                    elif line.startswith("License-Expression:") or (line.startswith("License:") and not lic):
                        lic = line.split(":", 1)[1].strip()[:120]
                    elif line.startswith("Classifier: License ::") and not lic:
                        lic = line.split("::")[-1].strip()
                    elif line.strip() == "":
                        break
        lic_files = []
        for base, _, files in os.walk(os.path.join(site, d)):
            for f in files:
                if re.match(r"(LICEN[CS]E|COPYING|NOTICE|AUTHORS)", f, re.I):
                    lic_files.append(os.path.join(base, f))
        if lic_files:
            pd = os.path.join(out_dir, name)
            os.makedirs(pd, exist_ok=True)
            for lf in lic_files:
                shutil.copy2(lf, os.path.join(pd, os.path.basename(lf)))
        rows.append((name, ver, lic or "see license files"))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--deps", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    deps, out = a.deps, os.path.join(a.out, "CyriqCap-API")
    t0 = time.time()
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(out)
    lic = os.path.join(out, "licenses")
    os.makedirs(lic)

    # ---- ffmpeg (LGPL)
    log("ffmpeg")
    os.makedirs(os.path.join(out, "bin"))
    with zipfile.ZipFile(os.path.join(deps, "ffmpeg-master-latest-win64-lgpl.zip")) as z:
        for n in z.namelist():
            if n.endswith("bin/ffmpeg.exe"):
                with z.open(n) as s, open(os.path.join(out, "bin", "ffmpeg.exe"), "wb") as d:
                    shutil.copyfileobj(s, d)
            if n.endswith("LICENSE.txt"):
                with z.open(n) as s, open(os.path.join(lic, "ffmpeg-LICENSE.txt"), "wb") as d:
                    shutil.copyfileobj(s, d)

    # ---- whisper.cpp (MIT)
    log("whisper.cpp")
    wdir = os.path.join(out, "whisper.cpp")
    os.makedirs(wdir)
    with zipfile.ZipFile(os.path.join(deps, "whisper-bin-x64.zip")) as z:
        for n in z.namelist():
            b = os.path.basename(n)
            if b == "whisper-cli.exe" or b == "whisper.dll" or (b.startswith("ggml") and b.endswith(".dll")):
                with z.open(n) as s, open(os.path.join(wdir, b), "wb") as d:
                    shutil.copyfileobj(s, d)
    shutil.copy2(os.path.join(deps, "whisper.cpp-LICENSE"), os.path.join(lic, "whisper.cpp-LICENSE.txt"))

    # ---- models
    log("models")
    md = os.path.join(out, "models")
    os.makedirs(md)
    src_small = os.path.join(deps, "ggml-small.bin")
    got = sha1(src_small)
    if got != GGML_SMALL_SHA1:
        sys.exit("ggml-small.bin checksum mismatch: %s" % got)
    shutil.copy2(src_small, os.path.join(md, "ggml-small.bin"))
    shutil.copytree(os.path.join(deps, "models", "faster-whisper-small"), os.path.join(md, "faster-whisper-small"))
    shutil.copytree(os.path.join(deps, "models", "align"), os.path.join(md, "align"))
    shutil.copytree(os.path.join(deps, "models", "nltk_data"), os.path.join(md, "nltk_data"))

    # ---- python + WhisperX
    log("python")
    pdir = os.path.join(out, "python")
    with zipfile.ZipFile(os.path.join(deps, "python-3.11.9-embed-amd64.zip")) as z:
        z.extractall(pdir)
    with open(os.path.join(pdir, "python311._pth"), "w", newline="\r\n") as f:
        f.write("python311.zip\n.\nLib\\site-packages\n\nimport site\n")
    shutil.copy2(os.path.join(pdir, "LICENSE.txt"), os.path.join(lic, "python-LICENSE.txt"))
    site = os.path.join(pdir, "Lib", "site-packages")
    dropped = copytree_filtered(os.path.join(deps, "winsite"), site)
    log("dropped", dropped, "build-only files/dirs")
    rows = collect_python_licenses(site, os.path.join(lic, "python-packages"))
    with open(os.path.join(lic, "python-packages.txt"), "w", encoding="utf-8") as f:
        f.write("Python packages bundled with the CyriqCap API (name, version, license)\n\n")
        for r in rows:
            f.write("%-34s %-16s %s\n" % r)

    shutil.copytree(os.path.join(ROOT, "api", "whisperx"), os.path.join(out, "whisperx"),
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))

    # ---- docs
    for f in os.listdir(os.path.join(ROOT, "api", "docs")):
        shutil.copy2(os.path.join(ROOT, "api", "docs", f), os.path.join(out, f) if f.endswith(".txt") and f.startswith("README") else os.path.join(lic, f))

    # ---- manifest
    log("hashing")
    files = []
    sizes = {}
    for base, _, fs in os.walk(out):
        for f in fs:
            p = os.path.join(base, f)
            rel = os.path.relpath(p, out).replace("\\", "/")
            if rel == "cyriqcap-api.json":
                continue
            g = group_for(rel)
            st = os.path.getsize(p)
            files.append({"path": rel, "size": st, "sha256": sha256(p), "group": g})
            sizes[g] = sizes.get(g, 0) + st
    files.sort(key=lambda x: x["path"])
    manifest = {"name": "CyriqCap API", "version": VERSION, "platform": "win-x64",
                "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "files": files}
    with open(os.path.join(out, "cyriqcap-api.json"), "w") as f:
        json.dump(manifest, f, indent=0)
    total = sum(sizes.values())
    report = {"total_bytes": total, "files": len(files), "groups": dict(sorted(sizes.items(), key=lambda x: -x[1]))}
    with open(os.path.join(a.out, "api-size-report.json"), "w") as f:
        json.dump(report, f, indent=2)
    log("done in %.0fs: %d files, %.2f GB" % (time.time() - t0, len(files), total / 1e9))
    for g, s in report["groups"].items():
        log("  %-28s %8.1f MB" % (g, s / 1e6))


if __name__ == "__main__":
    main()

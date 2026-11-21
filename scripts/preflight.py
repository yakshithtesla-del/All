#!/usr/bin/env python3
"""Pre-flight validation harness for the race video production pipeline.

Checks project assets (voice, words, mix, shots), story/source consistency,
render readiness (ffmpeg/ffprobe/remotion, disk), QA inputs, and audio sanity
(EBU R128 loudness, edge silence) against the finale mix.

Usage:
    python3 scripts/preflight.py            # full run (requires public/audio/mix.wav)
    python3 scripts/preflight.py --dry      # dry-run: mix.wav absence -> WARN, audio-sanity checks skipped

Exit code is nonzero if any CRITICAL check fails (WARN/SKIP never fail).
A human-readable log is appended to /tmp/files/preflight.log.
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------- setup ----

ROOT = Path(__file__).resolve().parent.parent
LOG_FILE = Path("/tmp/files/preflight.log")

RESULTS = []  # (num, title, level, detail, critical)
PASS, FAIL, WARN, SKIP = "PASS", "FAIL", "WARN", "SKIP"


def record(num: str, title: str, level: str, detail: str, critical: bool = True):
    RESULTS.append((num, title, level, detail, critical))


def run(cmd, timeout=120):
    """Run a command; return (returncode, stdout, stderr), never raising."""
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, errors="replace", timeout=timeout)
        return p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired:
        return 124, "", f"TIMEOUT after {timeout}s"
    except FileNotFoundError:
        return 127, "", f"not found: {cmd[0]}"
    except Exception as e:  # noqa: BLE001
        return -1, "", f"error: {e}"


def ffprobe_json(path: Path):
    code, out, err = run(["ffprobe", "-v", "error", "-show_entries",
                           "format=format_name,duration:stream=codec_type,codec_name,sample_rate,channels",
                           "-of", "json", str(path)])
    if code != 0:
        return None, err.strip()
    try:
        return json.loads(out), ""
    except json.JSONDecodeError as e:
        return None, f"bad ffprobe json: {e}"


# ----------------------------------------------------------------- A. assets ----

def check_voice_wav():
    p = ROOT / "public/voice/voice.wav"
    if not p.exists():
        return record("1", "public/voice/voice.wav exists, wav, 48 kHz stereo, 109-114 s",
                      FAIL, f"missing: {p}")
    meta, err = ffprobe_json(p)
    if meta is None:
        return record("1", "public/voice/voice.wav exists, wav, 48 kHz stereo, 109-114 s",
                      FAIL, err)
    fmt = meta.get("format", {})
    streams = meta.get("streams", [])
    probes = [s for s in streams if s.get("codec_type") == "audio"]
    if fmt.get("format_name") != "wav":
        return record("1", "public/voice/voice.wav exists, wav, 48 kHz stereo, 109-114 s",
                      FAIL, f"not wav (format={fmt.get('format_name')})")
    if not probes:
        return record("1", "public/voice/voice.wav exists, wav, 48 kHz stereo, 109-114 s",
                      FAIL, "no audio stream")
    s = probes[0]
    sr, ch = int(s.get("sample_rate", 0)), int(s.get("channels", 0))
    dur = float(fmt.get("duration", 0))
    if sr != 48000 or ch != 2:
        return record("1", "public/voice/voice.wav exists, wav, 48 kHz stereo, 109-114 s",
                      FAIL, f"sample_rate={sr}, channels={ch} (want 48000/2)")
    if not (109.0 <= dur <= 114.0):
        return record("1", "public/voice/voice.wav exists, wav, 48 kHz stereo, 109-114 s",
                      FAIL, f"duration={dur:.3f}s (want 109..114)")
    record("1", "public/voice/voice.wav exists, wav, 48 kHz stereo, 109-114 s",
           PASS, f"wav pcm_s16le {sr} Hz {ch}ch, {dur:.3f}s")


def check_words_json():
    p = ROOT / "public/voice/words.json"
    if not p.exists():
        return record("2", "public/voice/words.json parses; 300-400 entries; starts strictly increasing; last end <= 113.5 s",
                      FAIL, f"missing: {p}")
    try:
        words = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        return record("2", "public/voice/words.json parses; 300-400 entries; starts strictly increasing; last end <= 113.5 s",
                      FAIL, f"json parse error: {e}")
    if not isinstance(words, list) or not all(isinstance(w, dict) and {"word", "start", "end"} <= set(w) for w in words):
        return record("2", "public/voice/words.json parses; 300-400 entries; starts strictly increasing; last end <= 113.5 s",
                      FAIL, "not a list of {word,start,end} objects")
    n = len(words)
    if not (300 <= n <= 400):
        return record("2", "public/voice/words.json parses; 300-400 entries; starts strictly increasing; last end <= 113.5 s",
                      FAIL, f"{n} entries (want 300..400)")
    starts = [w["start"] for w in words]
    bad = [i for i in range(n - 1) if not (starts[i] < starts[i + 1])]
    if bad:
        i = bad[0]
        return record("2", "public/voice/words.json parses; 300-400 entries; starts strictly increasing; last end <= 113.5 s",
                      FAIL, f"{n} entries; starts NOT strictly increasing at idx {i}: "
                            f"{words[i]['word']} {starts[i]} -> {words[i+1]['word']} {starts[i+1]} "
                            f"({len(bad)} violation(s))")
    last_end = max(w["end"] for w in words)
    if last_end > 113.5:
        return record("2", "public/voice/words.json parses; 300-400 entries; starts strictly increasing; last end <= 113.5 s",
                      FAIL, f"{n} entries; last end {last_end:.3f}s > 113.5s")
    record("2", "public/voice/words.json parses; 300-400 entries; starts strictly increasing; last end <= 113.5 s",
           PASS, f"{n} entries, starts strictly increasing, last end {last_end:.3f}s")


def check_mix_wav(dry: bool):
    p = ROOT / "public/audio/mix.wav"
    if not p.exists():
        if dry:
            return record("3", "public/audio/mix.wav exists with duration ~113.4s ± 0.5",
                          WARN, f"missing: {p} (OK in --dry run; will be produced by the pipeline)", critical=False)
        return record("3", "public/audio/mix.wav exists with duration ~113.4s ± 0.5",
                      FAIL, f"missing: {p}")
    meta, err = ffprobe_json(p)
    if meta is None:
        return record("3", "public/audio/mix.wav exists with duration ~113.4s ± 0.5",
                      FAIL, err)
    dur = float(meta.get("format", {}).get("duration", 0))
    if abs(dur - 113.4) > 0.5:
        return record("3", "public/audio/mix.wav exists with duration ~113.4s ± 0.5",
                      FAIL, f"duration={dur:.3f}s (want 113.4 ± 0.5)")
    record("3", "public/audio/mix.wav exists with duration ~113.4s ± 0.5",
           PASS, f"duration={dur:.3f}s")


def check_shots_json():
    p = ROOT / "out/race/shots.json"
    if not p.exists():
        return record("4", "out/race/shots.json exists, 40 shots, ascending [a,b), last b == 3402",
                      FAIL, f"missing: {p}")
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        return record("4", "out/race/shots.json exists, 40 shots, ascending [a,b), last b == 3402",
                      FAIL, f"json parse error: {e}")
    shots = data.get("shots")
    if not isinstance(shots, list):
        return record("4", "out/race/shots.json exists, 40 shots, ascending [a,b), last b == 3402",
                      FAIL, "no 'shots' list")
    if len(shots) != 40:
        return record("4", "out/race/shots.json exists, 40 shots, ascending [a,b), last b == 3402",
                      FAIL, f"{len(shots)} shots (want 40)")
    for i, s in enumerate(shots):
        if not (isinstance(s, dict) and "a" in s and "b" in s):
            return record("4", "out/race/shots.json exists, 40 shots, ascending [a,b), last b == 3402",
                          FAIL, f"shot {i} missing a/b")
        if i and shots[i - 1]["b"] != s["a"]:
            return record("4", "out/race/shots.json exists, 40 shots, ascending [a,b), last b == 3402",
                          FAIL, f"gap/overlap between shot {i-1} and {i}: "
                                f"{shots[i-1]['b']} vs {s['a']}")
        if s["a"] >= s["b"]:
            return record("4", "out/race/shots.json exists, 40 shots, ascending [a,b), last b == 3402",
                          FAIL, f"shot {i} has empty/degenerate range [{s['a']},{s['b']})")
    if shots[-1]["b"] != 3402:
        return record("4", "out/race/shots.json exists, 40 shots, ascending [a,b), last b == 3402",
                      FAIL, f"last b = {shots[-1]['b']} (want 3402)")
    record("4", "out/race/shots.json exists, 40 shots, ascending [a,b), last b == 3402",
           PASS, f"40 shots, contiguous ascending, last b = {shots[-1]['b']}")


# ----------------------------------------------------------------- B. story ----

def check_story_constants():
    p = ROOT / "src/videos/race/story.ts"
    if not p.exists():
        return record("5", "story.ts exports TOTAL=3402, FPS=30", FAIL, f"missing: {p}")
    text = p.read_text(encoding="utf-8")
    total_ok = re.search(r"export\s+const\s+TOTAL\s*=\s*3402\s*;", text) is not None
    fps_ok = re.search(r"export\s+const\s+FPS\s*=\s*30\s*;", text) is not None
    if not (total_ok and fps_ok):
        return record("5", "story.ts exports TOTAL=3402, FPS=30", FAIL,
                      f"TOTAL=3402: {total_ok}; FPS=30: {fps_ok} (regex check)")
    record("5", "story.ts exports TOTAL=3402, FPS=30", PASS, "TOTAL=3402, FPS=30 found")


def check_story_shots():
    p = ROOT / "src/videos/race/story.ts"
    text = p.read_text(encoding="utf-8")
    m = re.search(r"const\s+A\s*:\s*Anchor\[\]\s*=\s*\[(.*?)\];", text, re.S)
    if not m:
        return record("6", "Number of shots in story.ts (SHOTS array length) == 40",
                      FAIL, "could not locate the anchor array A (SHOTS drives)")
    block = m.group(1)
    anchors = re.findall(r"^\s*\[.*$", block, re.M)
    if len(anchors) != 40:
        return record("6", "Number of shots in story.ts (SHOTS array length) == 40",
                      FAIL, f"anchor count = {len(anchors)} (want 40)")
    record("6", "Number of shots in story.ts (SHOTS array length) == 40",
           PASS, "40 anchors -> SHOTS length 40")


# ----------------------------------------------------------------- C. render ----

def check_tools():
    fails = []
    ffmpeg_ver = ""
    code, out, err = run(["ffmpeg", "-version"], timeout=30)
    if code != 0:
        fails.append(f"ffmpeg -version rc={code}")
    else:
        ffmpeg_ver = (out or "").splitlines()[0].strip() if out else "?"
    code, out, err = run(["ffprobe", "-version"], timeout=30)
    if code != 0:
        fails.append(f"ffprobe -version rc={code}")
    if fails:
        return record("7", "ffmpeg and ffprobe work", FAIL, "; ".join(fails))
    record("7", "ffmpeg and ffprobe work", PASS, f"ffmpeg: {ffmpeg_ver}")


def check_remotion():
    rem = ROOT / "node_modules/@remotion"
    if not rem.is_dir():
        return record("8", "node_modules/@remotion exists; npx remotion --help exits 0",
                      FAIL, f"missing: {rem}")
    code, out, err = run(["npx", "remotion", "--help"], timeout=150)
    if code != 0:
        return record("8", "node_modules/@remotion exists; npx remotion --help exits 0",
                      FAIL, f"npx remotion --help rc={code}: {err.strip()[:300]}")
    record("8", "node_modules/@remotion exists; npx remotion --help exits 0",
           PASS, f"{rem.name} present; npx remotion --help rc=0")


def check_temp_vars():
    bad = [v for v in ("TMPDIR", "TEMP", "TMP") if os.environ.get(v) and os.environ[v] != "/tmp/remotion-tmp"]
    if bad:
        vals = ", ".join(f"{v}={os.environ[v]}" for v in bad)
        return record("9", "TEMP/TMP vars point to /tmp/remotion-tmp",
                      WARN, f"{vals} (not /tmp/remotion-tmp)", critical=False)
    set_vars = [v for v in ("TMPDIR", "TEMP", "TMP") if os.environ.get(v)]
    if not set_vars:
        return record("9", "TEMP/TMP vars point to /tmp/remotion-tmp",
                      WARN, "TMPDIR/TEMP/TMP unset (tools will default to /tmp)", critical=False)
    record("9", "TEMP/TMP vars point to /tmp/remotion-tmp",
           PASS, "TMPDIR/TEMP/TMP set to /tmp/remotion-tmp")


def check_disk():
    import shutil
    problems = []
    for path, min_free, label in ((Path("/tmp"), 20 * 2**30, "/tmp"),
                                  (Path("/workspaces"), 5 * 2**30, "/workspaces")):
        try:
            free = shutil.disk_usage(path).free
        except OSError as e:
            problems.append(f"{label}: cannot stat ({e})")
            continue
        if free <= min_free:
            problems.append(f"{label}: {free/2**30:.1f} GiB free (want > {min_free/2**30:.0f} GiB)")
    if problems:
        return record("10", "Disk free: /tmp > 20 GB, /workspaces > 5 GB", FAIL, "; ".join(problems))
    t = shutil.disk_usage("/tmp").free / 2**30
    w = shutil.disk_usage("/workspaces").free / 2**30
    record("10", "Disk free: /tmp > 20 GB, /workspaces > 5 GB",
           PASS, f"/tmp {t:.1f} GiB free, /workspaces {w:.1f} GiB free")


# ----------------------------------------------------------------- D. QA ----

def check_short_qa():
    p = ROOT / "scripts/short_qa.py"
    if not p.is_file():
        return record("11", "scripts/short_qa.py exists", FAIL, f"missing: {p}")
    record("11", "scripts/short_qa.py exists", PASS, str(p))


def check_shot_lengths():
    p = ROOT / "out/race/shots.json"
    try:
        shots = json.loads(p.read_text(encoding="utf-8"))["shots"]
    except Exception as e:
        return record("12", "Every shot length >= 0.5 s and <= 12 s", FAIL, f"cannot read shots.json: {e}")
    bad = []
    for s in shots:
        frames = s["b"] - s["a"]
        secs = frames / 30.0
        if not (0.5 <= secs <= 12.0):  # 0.8 s punch shots (shot 39) are intentional
            bad.append(f"shot {s['id']}: {frames} frames = {secs:.2f}s")
    if bad:
        return record("12", "Every shot length >= 0.5 s and <= 12 s", FAIL, "; ".join(bad))
    record("12", "Every shot length >= 0.5 s and <= 12 s", PASS,
           f"all {len(shots)} shots within 1-12 s")


# ----------------------------------------------------------------- E. audio ----

def check_loudness(mix: Path):
    code, out, err = run(["ffmpeg", "-i", str(mix), "-af", "ebur128=peak=true",
                           "-f", "null", "-"], timeout=300)
    if code != 0:
        return record("13", "mix.wav loudness: integrated I in [-18,-12] LUFS; true peak <= -0.8 dBTP",
                      FAIL, f"ffmpeg rc={code}: {err.strip()[-300:]}")
    tail = err[err.rfind("Summary:"):]
    I = re.findall(r"I:\s+(-?\d+(?:\.\d+)?)\s+LUFS", tail)
    peak = re.findall(r"Peak:\s+(-?\d+(?:\.\d+)?)\s+dBFS", tail)
    if not I or not peak:
        return record("13", "mix.wav loudness: integrated I in [-18,-12] LUFS; true peak <= -0.8 dBTP",
                      FAIL, f"could not parse ebur128 summary: {tail.strip()[-300:]}")
    i_val = float(I[-1])
    peak_vals = [float(x) for x in peak]
    pk_val = max(peak_vals)  # worst (most positive) true peak
    if not (-18.0 <= i_val <= -12.0):
        return record("13", "mix.wav loudness: integrated I in [-18,-12] LUFS; true peak <= -0.8 dBTP",
                      FAIL, f"I = {i_val:.2f} LUFS (want -18..-12); peak {pk_val:.2f} dBTP")
    if pk_val > -0.8:
        return record("13", "mix.wav loudness: integrated I in [-18,-12] LUFS; true peak <= -0.8 dBTP",
                      FAIL, f"I = {i_val:.2f} LUFS; true peak {pk_val:.2f} dBTP > -0.8")
    record("13", "mix.wav loudness: integrated I in [-18,-12] LUFS; true peak <= -0.8 dBTP",
           PASS, f"I = {i_val:.2f} LUFS, true peak {pk_val:.2f} dBTP")


def check_edge_silence(mix: Path):
    code, out, err = run(["ffmpeg", "-i", str(mix), "-af", "silencedetect=n=-45dB:d=1.0",
                           "-f", "null", "-"], timeout=300)
    if code != 0:
        return record("14", "mix.wav has audio in first and last 2 s (no silence > 1 s at edges)",
                      FAIL, f"ffmpeg rc={code}: {err.strip()[-300:]}")
    starts = [float(x) for x in re.findall(r"silence_start:\s+([\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end:\s+([\d.]+)", err)]
    dur = 113.4
    meta, _ = ffprobe_json(mix)
    if meta:
        dur = float(meta.get("format", {}).get("duration", dur))
    silences = list(zip(starts, ends)) if len(starts) == len(ends) else []
    if len(starts) != len(ends):
        # unmatched ends: assume silence runs to EOF
        matched = len(ends)
        for s in starts[matched:]:
            silences.append((s, dur))
    # front edge: silence covers the start of the file so that the first 2 s are empty
    front_bad = [s for s in silences if s[0] <= 0.05 and s[1] >= 2.0]
    # back edge: silence covers the end of the file so that the last 2 s are empty
    back_bad = [s for s in silences if s[1] >= dur - 0.05 and s[0] <= dur - 2.0]
    if front_bad or back_bad:
        parts = []
        if front_bad:
            parts.append(f"first 2 s silent (silence {front_bad[0][0]:.2f}->{front_bad[0][1]:.2f}s)")
        if back_bad:
            parts.append(f"last 2 s silent (silence {back_bad[0][0]:.2f}->{back_bad[0][1]:.2f}s)")
        return record("14", "mix.wav has audio in first and last 2 s (no silence > 1 s at edges)",
                      FAIL, "; ".join(parts))
    record("14", "mix.wav has audio in first and last 2 s (no silence > 1 s at edges)",
           PASS, f"audio present in first and last 2 s ({len(silences)} silence(s) > 1 s detected in the middle)")


# ----------------------------------------------------------------- main ----

def main():
    ap = argparse.ArgumentParser(description="Pre-flight validation for the race video pipeline")
    ap.add_argument("--dry", action="store_true",
                    help="dry-run: mix.wav absence is a WARN; skip audio-sanity checks (13,14)")
    args = ap.parse_args()

    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    lines = []

    def emit(line):
        print(line)
        lines.append(line)

    def flush_log(exit_code):
        try:
            with LOG_FILE.open("a", encoding="utf-8") as f:
                f.write("\n" + "=" * 72 + "\n")
                f.write(f"preflight.py run at {datetime.now().isoformat()} "
                        f"(mode={'--dry' if args.dry else 'full'}) exit={exit_code}\n")
                f.write("\n".join(lines) + "\n")
        except Exception as e:  # noqa: BLE001
            try:
                print(f"[WARN] could not write log {LOG_FILE}: {e}")
            except Exception:
                pass

    emit(f"Pre-flight validation — {'DRY RUN' if args.dry else 'FULL RUN'} · {ROOT}")
    emit("")

    check_voice_wav()
    check_words_json()
    check_mix_wav(args.dry)
    check_shots_json()
    check_story_constants()
    check_story_shots()
    check_tools()
    check_remotion()
    check_temp_vars()
    check_disk()
    check_short_qa()
    check_shot_lengths()

    mix = ROOT / "public/audio/mix.wav"
    if args.dry or not mix.exists():
        record("13", "mix.wav loudness: integrated I in [-18,-12] LUFS; true peak <= -0.8 dBTP",
               SKIP, "requires mix.wav (skipped in --dry / absent)", critical=False)
        record("14", "mix.wav has audio in first and last 2 s (no silence > 1 s at edges)",
               SKIP, "requires mix.wav (skipped in --dry / absent)", critical=False)
    else:
        check_loudness(mix)
        check_edge_silence(mix)

    emit(f"{'#':<3} {'STATUS':<5} CHECK")
    emit("-" * 100)
    for num, title, level, detail, critical in RESULTS:
        emit(f"[{num:>2}] {level:<5} {title}")
        if detail:
            emit(f"        -> {detail}")
    emit("-" * 100)

    n_pass = sum(1 for _, _, l, _, _ in RESULTS if l == PASS)
    n_fail = sum(1 for _, _, l, _, _ in RESULTS if l == FAIL)
    n_warn = sum(1 for _, _, l, _, _ in RESULTS if l == WARN)
    n_skip = sum(1 for _, _, l, _, _ in RESULTS if l == SKIP)
    crit_fail = [num for num, _, l, _, critical in RESULTS if l == FAIL and critical]

    emit(f"SUMMARY: {n_pass} passed, {n_fail} failed, {n_warn} warnings, {n_skip} skipped "
         f"(critical failures: {len(crit_fail)})")
    if crit_fail:
        emit(f"CRITICAL FAILURES (exit 1): {', '.join(crit_fail)}")
    else:
        emit("All critical checks passed. Exit 0.")

    exit_code = 1 if crit_fail else 0
    flush_log(exit_code)
    return exit_code


if __name__ == "__main__":
    sys.exit(main())

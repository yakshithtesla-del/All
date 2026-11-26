"""Step 1. Voice + word timings.
python town/voice.py town/stories/<story>.json
Speaks the story with a free edge-tts voice, one sentence at a time, cuts the dead air between
sentences (the real shorts never pause), speeds up until it fits the story's "seconds",
and writes build/vo.wav + build/words.json (every word with start/end and the shot it belongs to)."""
import sys, os, json, asyncio, subprocess, re, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
MILO = os.path.dirname(HERE)
BUILD = os.environ.get("PLANET_BUILD", os.path.join(HERE, "build")); SR = 48000
CFG = json.load(open(os.path.join(MILO, "config.json"), encoding="utf-8"))


async def speak(text, voice, rate, out):
    import edge_tts
    com = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    words = []
    with open(out, "wb") as f:
        async for ch in com.stream():
            if ch["type"] == "audio": f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append([ch["offset"] / 1e7, (ch["offset"] + ch["duration"]) / 1e7, ch["text"]])
    return words


def pcm(path):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"])
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


norm = lambda s: re.sub(r"[^a-z0-9']", "", s.lower().replace("’", "'"))


def build(story, voice, rate, gap):
    # sentences = runs of shot lines up to . ! ? or ...
    sents = []; cur = []
    for si, s in enumerate(story["shots"]):
        line = (s.get("line") or "").strip()
        if not line: continue
        cur.append((si, line))
        if re.search(r"[.!?…]$", line): sents.append(cur); cur = []
    if cur: sents.append(cur)
    audio = []; out = []; t = 0.0
    for k, sent in enumerate(sents):
        text = " ".join(l for _, l in sent)
        mp3 = os.path.join(BUILD, f"_s{k}.mp3")
        for attempt in range(6):  # the free service drops a request now and then
            try:
                wb = asyncio.run(speak(text, voice, rate, mp3)); break
            except Exception as e:
                if attempt == 5: raise
                time.sleep(2 + 2 * attempt)
        a = pcm(mp3).copy(); os.remove(mp3)
        idx = np.nonzero(np.abs(a) > 0.012)[0]
        lead = max(0, idx[0] - int(0.015 * SR)); tail = min(len(a), idx[-1] + int(0.05 * SR))
        a = a[lead:tail]; lead_s = lead / SR
        owners = [(si, w) for si, l in sent for w in l.split() if norm(w)]
        j = 0
        for st, en, tx in wb:
            pieces = [p for p in tx.split() if norm(p)] or [tx]
            for q in range(len(pieces)):
                si, shown = owners[min(j, len(owners) - 1)]; j += 1
                b0 = st + (en - st) * q / len(pieces); b1 = st + (en - st) * (q + 1) / len(pieces)
                out.append({"t0": round(max(0, b0 - lead_s) + t, 3), "t1": round(min(len(a) / SR, b1 - lead_s) + t, 3), "word": shown, "shot": si})
        if j != len(owners): print("  ! word count mismatch in:", text, j, len(owners))
        fade = int(0.008 * SR); a[:fade] *= np.linspace(0, 1, fade); a[-fade:] *= np.linspace(1, 0, fade)
        audio.append(a); t += len(a) / SR
        if k < len(sents) - 1:
            audio.append(np.zeros(int(gap * SR), np.float32)); t += gap
    return np.concatenate(audio), out


def sentences(story):
    """Shot lines grouped into sentences (runs of lines up to . ! ? or ...)."""
    sents, cur = [], []
    for si, s in enumerate(story["shots"]):
        line = (s.get("line") or "").strip()
        if not line: continue
        cur.append((si, line))
        if re.search(r"[.!?…]$", line): sents.append(cur); cur = []
    if cur: sents.append(cur)
    return sents


def word_times(a):
    """Word start/end times in a 48 kHz clip, from faster-whisper (given as an array: PyAV here can't open files)."""
    from faster_whisper import WhisperModel
    global _WM
    if "_WM" not in globals():
        _WM = WhisperModel("small.en", device="cpu", compute_type="int8")
    segs, _ = _WM.transcribe(a[::3].astype(np.float32), language="en", word_timestamps=True, beam_size=5)
    return [(w.start, w.end, w.word.strip()) for sg in segs for w in sg.words]


def build_clone(story, gap):
    """The story in your sample voice (VoxCPM2 clone, town/clone.py in the "voxcpm_python" environment), one clip per
    sentence; word timings from whisper, matched to the script's words in order."""
    c = story["clone"]
    sents = sentences(story)
    out_dir = os.path.join(BUILD, "clone")
    job = {"ref": os.path.join(HERE, c["ref"]), "ref_text": open(os.path.join(HERE, c["ref_text"]), encoding="utf-8").read().strip()
           if c["ref_text"].endswith(".txt") else c["ref_text"], "out": out_dir, "seed": c.get("seed", 41),
           "sentences": [" ".join(l for _, l in sent) for sent in sents]}
    want = [os.path.join(out_dir, f"s{k:02d}.wav") for k in range(len(sents))]
    stamp = os.path.join(out_dir, "job.json")
    old = json.load(open(stamp, encoding="utf-8")) if os.path.exists(stamp) else None
    if old != job or not all(os.path.exists(w) for w in want):
        os.makedirs(out_dir, exist_ok=True)
        for f in want:
            if os.path.exists(f): os.remove(f)
        tmp = os.path.join(BUILD, "_clone_job.json")
        json.dump(job, open(tmp, "w", encoding="utf-8"), indent=1)
        py = CFG["voxcpm_python"]
        subprocess.check_call([py, os.path.join(HERE, "clone.py"), tmp])
        json.dump(job, open(stamp, "w", encoding="utf-8"), indent=1)
    audio, out, t = [], [], 0.0
    for k, sent in enumerate(sents):
        a = pcm(want[k]).copy()
        idx = np.nonzero(np.abs(a) > 0.02 * np.abs(a).max() / 0.89)[0]
        lead = max(0, idx[0] - int(0.015 * SR)); tail = min(len(a), idx[-1] + int(0.05 * SR))
        a = a[lead:tail]
        wt = word_times(a)
        owners = [(si, w) for si, l in sent for w in l.split() if norm(w)]
        if len(wt) != len(owners):
            print(f"  ! whisper heard {len(wt)} words, script has {len(owners)}: spreading by length in: {job['sentences'][k]}")
            tot = sum(len(norm(w)) + 1 for _, w in owners); acc = 0.0; d = len(a) / SR; wt = []
            for _, w in owners:
                n = (len(norm(w)) + 1) / tot; wt.append((acc * d, (acc + n) * d, w)); acc += n
        for (si, shown), (st, en, _) in zip(owners, wt):
            out.append({"t0": round(st + t, 3), "t1": round(min(en, len(a) / SR) + t, 3), "word": shown, "shot": si})
        fade = int(0.008 * SR); a[:fade] *= np.linspace(0, 1, fade); a[-fade:] *= np.linspace(1, 0, fade)
        audio.append(a); t += len(a) / SR
        if k < len(sents) - 1:
            audio.append(np.zeros(int(gap * SR), np.float32)); t += gap
    return np.concatenate(audio), out


def tempo(audio, words, factor):
    """Speed up without changing pitch (ffmpeg atempo)."""
    p = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-af", f"atempo={factor:.4f}",
                        "-f", "f32le", "-"], input=audio.astype(np.float32).tobytes(), capture_output=True, check=True)
    for w in words: w["t0"] = round(w["t0"] / factor, 3); w["t1"] = round(w["t1"] / factor, 3)
    return np.frombuffer(p.stdout, np.float32).copy(), words


def cap(story):
    """The longest the video may run ("max_seconds"; older stories only have "seconds")."""
    return float(story.get("max_seconds", story.get("seconds", 20)))


def fit_seconds(story_path, story, total):
    """The loop rule: the video ends right after the last word ("because..."), never on dead air. Sets the
    story's "seconds" to the voice length + "end_pad" (default 0.05 s) and saves the story."""
    pad = float(story.get("end_pad", 0.05))
    need = round(total + pad, 2)
    if "max_seconds" not in story:
        story["max_seconds"] = float(story.get("seconds", 20))
    if abs(float(story.get("seconds", 0)) - need) > 0.005:
        story["seconds"] = need
        open(story_path, "w", encoding="utf-8").write(json.dumps(story, indent=1, ensure_ascii=False) + "\n")
    print(f"  video length {need}s: it cuts {pad}s after the last word (loop)")


def main(story_path):
    story = json.load(open(story_path, encoding="utf-8"))
    c = story.get("clone")
    if c and os.path.exists(os.path.join(HERE, c["ref"])) and CFG.get("voxcpm_python") and os.path.exists(CFG["voxcpm_python"]):
        return main_clone(story_path, story)
    if c:
        print("  no voice sample in town/voice_ref (or no voxcpm_python in config.json): using the free edge-tts voice")
    voice = story.get("voice", "en-US-AndrewNeural")
    lead = story.get("lead", 0.1)
    target = cap(story) - story.get("tail", 0.25) - lead
    gap = story.get("gap", 0.09)
    os.makedirs(BUILD, exist_ok=True)
    for pct in range(int(str(story.get("rate", "+10%")).strip("+%")), 60, 3):
        audio, words = build(story, voice, f"+{pct}%", gap)
        d = len(audio) / SR
        print(f"{voice} +{pct}%: {d:.2f}s (target {target:.2f}s)")
        if d <= target: break
    write_out(story_path, story, audio, words, lead, f"+{pct}%", voice)


def main_clone(story_path, story):
    lead = story.get("lead", 0.1)
    target = cap(story) - story.get("tail", 0.25) - lead
    os.makedirs(BUILD, exist_ok=True)
    audio, words = build_clone(story, story.get("gap", 0.09))
    d = len(audio) / SR
    # Shorts pacing: never slower than min_speed (default 1.1), faster if needed to fit, up to max_speed
    factor = min(story["clone"].get("max_speed", 1.25), max(story["clone"].get("min_speed", 1.1), d / target))
    if factor > 1.0:
        audio, words = tempo(audio, words, factor)
    d2 = len(audio) / SR
    print(f"clone voice: {d:.2f}s natural, x{factor:.2f} -> {d2:.2f}s (target {target:.2f}s)")
    if d2 > target + 0.02:
        print(f"  the story is long even at x{factor:.2f}: the video will run {d2 + lead:.1f}s")
    write_out(story_path, story, audio, words, lead, f"clone x{factor:.2f}", story["clone"]["ref"])


def write_out(story_path, story, audio, words, lead, rate, voice):
    audio = np.concatenate([np.zeros(int(lead * SR), np.float32), audio])
    fit_seconds(story_path, story, len(audio) / SR)
    for w in words: w["t0"] = round(w["t0"] + lead, 3); w["t1"] = round(w["t1"] + lead, 3)
    audio = audio / max(1e-6, np.abs(audio).max()) * 0.89
    wav = os.path.join(BUILD, "vo.wav")
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", wav], stdin=subprocess.PIPE)
    p.communicate(audio.astype(np.float32).tobytes())
    json.dump({"voice": voice, "rate": rate, "duration": len(audio) / SR, "words": words},
              open(os.path.join(BUILD, "words.json"), "w", encoding="utf-8"), indent=1)
    wps = len(words) / (words[-1]["t1"] - words[0]["t0"])
    print(f"wrote vo.wav {len(audio)/SR:.2f}s, {len(words)} words, {wps:.2f} words/s")
    for si, s in enumerate(story["shots"]):
        ws = [w for w in words if w["shot"] == si]
        if ws: print(f"  {ws[0]['t0']:6.2f}-{ws[-1]['t1']:6.2f}  {s['id']:8s} {s['line']}")


if __name__ == "__main__":
    main(sys.argv[1])

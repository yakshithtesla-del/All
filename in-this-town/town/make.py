"""One command for an In This Town short:
  python town/make.py town/stories/<story>.json [--preview] [--stills]
  1 voice.py   voice + word timings (the user's cloned sample voice when the story has "clone", needs the
               RTX 3060; else edge-tts, needs internet)
  2 render.py  frames (Blender)          --stills: three stills per shot + contact sheet instead, then stop
  3 finish.py  grade, captions, speed lines, flashes, sound mix (audio.py: music + SFX cues), mp4
--preview renders at half size. Frames render in 3-second chunks with a rest between; --resume keeps good frames."""
import sys, os, json, time, subprocess, glob
HERE = os.path.dirname(os.path.abspath(__file__))
MILO = os.path.dirname(HERE)
CFG = json.load(open(os.path.join(MILO, "config.json")))
PY = CFG.get("python") if os.path.isabs(CFG.get("python") or "") else sys.executable    # full path in config.json, else the Python running this


def build_dir(story_path):
    """Each story gets its own build folder (town/build/<slug>), so stories never overwrite each other's
    voice, frames or finals."""
    slug = os.path.splitext(os.path.basename(story_path))[0]
    d = os.path.join(HERE, "build", slug)
    os.makedirs(d, exist_ok=True)
    os.environ["PLANET_BUILD"] = d          # voice/render/finish/audio/sheet read it
    return d


BUILD = os.path.join(HERE, "build")


def run(name, cmd, timings):
    t = time.time()
    print(f"--- {name}", flush=True)
    subprocess.check_call(cmd, cwd=MILO)
    timings[name] = round(time.time() - t, 1)
    print(f"    {timings[name]} s", flush=True)


CHUNK, COOL = int(os.environ.get("PLANET_CHUNK", 300)), int(os.environ.get("PLANET_COOL", 15))    # frames per Blender run, seconds of rest between runs (the RTX 3060 crashed on long runs)


def good_frames(frames, w):
    """Frame numbers already rendered at this width and readable (a crash can leave a half-written jpg)."""
    from PIL import Image
    ok = set()
    for f in glob.glob(os.path.join(frames, "f_*.jpg")):
        try:
            with Image.open(f) as im:
                im.load()
                if im.size[0] == w:
                    ok.add(int(os.path.basename(f)[2:7]))
                    continue
        except Exception:
            pass
        os.remove(f)
    return ok


def render_chunks(story_path, base, scale, resume, timings):
    """Render resumable short chunks, print progress, and verify that each chunk created frames."""
    st = json.load(open(story_path, encoding="utf-8"))
    fps, nf = int(st.get("fps", 30)), int(round(float(st.get("seconds", 20)) * int(st.get("fps", 30))))
    frames = os.path.join(BUILD, "frames")
    os.makedirs(frames, exist_ok=True)
    if not resume:
        for f in glob.glob(os.path.join(frames, "f_*.jpg")):
            os.remove(f)
    have = good_frames(frames, 1080 * scale // 100)
    t = time.time()
    todo = [c for c in range(0, nf, CHUNK) if any(f not in have for f in range(c, min(nf, c + CHUNK)))]
    print(f"Render plan: {nf} frames at {fps} fps, {1080 * scale // 100}x{1920 * scale // 100}; "
          f"{len(todo)} chunks remaining; backend={os.environ.get('PLANET_GPU_BACKEND', 'auto')}", flush=True)
    for k, c in enumerate(todo):
        chunk_start = time.time()
        chunk_end = min(nf, c + CHUNK) - 1
        print(f"RENDERING chunk {k + 1}/{len(todo)} frames {c}-{chunk_end} "
              f"({c / fps:.1f}s-{chunk_end / fps:.1f}s)", flush=True)
        subprocess.check_call(base + ["--scale", str(scale), "--from", str(c / fps), "--to", str((min(nf, c + CHUNK) - 1) / fps),
                               "--keep"], cwd=MILO)
        have = good_frames(frames, 1080 * scale // 100)
        created = sum(f in have for f in range(c, chunk_end + 1))
        if created == 0:
            sys.exit("Blender produced no readable frames for this chunk")
        print(f"CHUNK COMPLETE {k + 1}/{len(todo)}: {created}/{chunk_end - c + 1} frames "
              f"in {time.time() - chunk_start:.1f}s", flush=True)
        if k < len(todo) - 1:
            time.sleep(COOL)
    have = good_frames(frames, 1080 * scale // 100)
    missing = [f for f in range(nf) if f not in have]
    if missing:
        sys.exit(f"{len(missing)} frames missing or broken (first {missing[:5]}): run again with --resume")
    timings["2 render"] = round(time.time() - t, 1)


def main():
    global BUILD
    story = os.path.abspath(sys.argv[1])
    BUILD = build_dir(story)
    preview, stills = "--preview" in sys.argv, "--stills" in sys.argv
    timings = {}
    if "--skip-voice" not in sys.argv:
        run("1 voice", [PY, os.path.join(HERE, "voice.py"), story], timings)
    base = [CFG["blender"], "-b", "--factory-startup", "--python", os.path.join(HERE, "render.py"), "--", story]
    if "--segment" in sys.argv:
        seg_i = sys.argv.index("--segment")
        start_f, end_f = int(sys.argv[seg_i + 1]), int(sys.argv[seg_i + 2])
        st = json.load(open(story, encoding="utf-8"))
        nf = int(round(float(st.get("seconds", 20)) * int(st.get("fps", 30))))
        if not (0 <= start_f < end_f <= nf):
            sys.exit(f"invalid segment bounds {start_f}:{end_f}; expected within 0:{nf}")
        print(f"RENDER SEGMENT {start_f}-{end_f - 1} of {nf} frames at 1080x1920", flush=True)
        run("2 segment", base + ["--segment-start", str(start_f), "--segment-end", str(end_f - 1), "--scale", "100"], timings)
        frames = os.path.join(BUILD, "frames")
        have = good_frames(frames, 1080)
        missing = [f for f in range(start_f, end_f) if f not in have]
        if missing:
            sys.exit(f"segment incomplete: {len(missing)} frames missing; first {missing[:5]}")
        print(f"SEGMENT COMPLETE {start_f}-{end_f - 1}: {end_f - start_f} frames", flush=True)
        return
    if stills:
        run("2 stills", base + ["--stills", "--scale", "35"], timings)
        run("   sheet", [PY, os.path.join(HERE, "sheet.py"), "9"], timings)
        print("look at:", os.path.join(BUILD, "stills", "_sheet0.jpg"))
        return
    render_chunks(story, base, 50 if preview else 100, "--resume" in sys.argv, timings)
    run("3 finish", [PY, os.path.join(HERE, "finish.py"), story] + (["--preview"] if preview else []), timings)
    json.dump(timings, open(os.path.join(BUILD, "timings.json"), "w"), indent=1)
    if not preview:
        deliver(story)
    print("done:", os.path.join(BUILD, "preview.mp4" if preview else "FINAL.mp4"))


OUTBOX = CFG.get("outbox") or os.path.join(HERE, "out")     # finished videos land here (config.json "outbox")


def deliver(story_path):
    """Copy FINAL.mp4 (+ credits) to the user's folder as 'NN - <title>.mp4' (NN = next number; same title = replace)."""
    import re, shutil
    if not os.path.isdir(os.path.dirname(os.path.abspath(OUTBOX))):
        print("  (outbox drive not found: final stays in town/build)")
        return
    os.makedirs(OUTBOX, exist_ok=True)
    title = json.load(open(story_path, encoding="utf-8")).get("title", os.path.basename(story_path))
    title = re.sub(r"^In This Town,?\s*", "", title).strip() or title
    title = re.sub(r'[<>:"/\|?*]', "", title)
    old = [f for f in os.listdir(OUTBOX) if f.endswith(".mp4") and f[5:-4] == title]
    nums = [int(f[:2]) for f in os.listdir(OUTBOX) if f[:2].isdigit() and f.endswith(".mp4")]
    name = old[0][:-4] if old else f"{max(nums, default=0) + 1:02d} - {title}"
    shutil.copy(os.path.join(BUILD, "FINAL.mp4"), os.path.join(OUTBOX, name + ".mp4"))
    cred = os.path.join(BUILD, "FINAL.credits.txt")
    credits = open(cred, encoding="utf-8").read().strip() if os.path.exists(cred) else ""
    upload = os.path.splitext(story_path)[0] + ".upload.txt"       # titles + YouTube/Facebook descriptions
    if os.path.exists(upload):
        txt = open(upload, encoding="utf-8").read().replace("{CREDITS}", credits)
        open(os.path.join(OUTBOX, name + " - credits.txt"), "w", encoding="utf-8").write(txt)
    elif credits:
        shutil.copy(cred, os.path.join(OUTBOX, name + " - credits.txt"))
    print("  delivered:", os.path.join(OUTBOX, name + ".mp4"))


if __name__ == "__main__":
    main()

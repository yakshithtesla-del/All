"""Make several In This Town stories one after another, safely, on the RTX 3060.
  python town/run_batch.py stills slug1 slug2 ...   voice + stills contact sheet for each (to check staging)
  python town/run_batch.py final  slug1 slug2 ...   full-size final for each (reuses the voice; --resume after a crash)
Stops at the first failure (a lost GPU needs a reboot; then run the same command again: finished finals are skipped)."""
import sys, os, subprocess, time, json
HERE = os.path.dirname(os.path.abspath(__file__))
MILO = os.path.dirname(HERE)
CFG = json.load(open(os.path.join(MILO, "config.json")))
PY = CFG.get("python") if os.path.isabs(CFG.get("python") or "") else sys.executable    # full path in config.json, else the Python running this
REST = 60          # seconds between stories so the card cools down

mode, slugs = sys.argv[1], sys.argv[2:]
for k, s in enumerate(slugs):
    story = os.path.join(HERE, "stories", s + ".json")
    b = os.path.join(HERE, "build", s)
    if mode == "final" and os.path.exists(os.path.join(b, "FINAL.mp4")):
        print(f"=== {s}: final already there, skip", flush=True)
        continue
    print(f"=== {s} ({k + 1}/{len(slugs)}) {time.strftime('%H:%M')}", flush=True)
    cmd = [PY, os.path.join(HERE, "make.py"), story]
    if mode == "stills":
        cmd.append("--stills")
    else:
        if os.path.exists(os.path.join(b, "words.json")):
            cmd.append("--skip-voice")
        if os.path.isdir(os.path.join(b, "frames")):
            cmd.append("--resume")
    r = subprocess.call(cmd, cwd=MILO)
    if r:
        sys.exit(f"=== {s} FAILED (exit {r}). If the GPU was lost: reboot, then run the same command again.")
    if k < len(slugs) - 1:
        time.sleep(REST)
print("=== all done", time.strftime('%H:%M'))

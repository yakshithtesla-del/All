"""Step 3a. Sound mix: the voice, a music bed under it, and SFX on the beats.
python town/audio.py town/stories/<story>.json   ->  build/mix.wav and build/credits.txt
Times come from build/words.json (a cue is "this shot's cut + dt seconds"), sounds from town/sounds.py.

In the story json:
  "music": {"track": "phantom", "start": 8.8, "db": -11, "duck": 0.3, "eq": "<ffmpeg filters>", "cut": [["nobody", "vase"]]}
      db    music loudness against the voice (RMS while talking); duck = how far it dips under each word (0..1)
      cut   [from_shot, to_shot]: music stops at the first cut and comes back at the second (a beat of silence)
  "sfx": [{"shot": "rule", "dt": 0.25, "s": "float", "db": -8, "len": 1.2, "fade": 0.3, "pan": -0.3}, ...]
      db    the sound's loudest moment against the voice's loudest moment (0 = as loud as the voice)
      len   keep only the first len seconds (with a fade); skip to cut a long ambience down
The voice always stays on top: everything else is set relative to it."""
import sys, os, json, subprocess
import numpy as np
import sounds

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.environ.get("PLANET_BUILD", os.path.join(HERE, "build"))
SR = 48000


def load(path, start=0.0, dur=None, af=None):
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start), "-i", path]
    if dur:
        cmd += ["-t", str(dur)]
    if af:
        cmd += ["-af", af]
    cmd += ["-ac", "2", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.check_output(cmd), np.float32).reshape(-1, 2).copy()


def fades(a, fin=0.004, fout=0.004):
    n = len(a)
    i, o = min(n, int(fin * SR)), min(n, int(fout * SR))
    if i:
        a[:i] *= np.linspace(0, 1, i)[:, None]
    if o:
        a[n - o:] *= np.linspace(1, 0, o)[:, None]
    return a


def envelope(mono, attack=0.03, release=0.25):
    """Smoothed loudness of the voice, 0..1 (1 = talking)."""
    hop = int(0.01 * SR)
    n = len(mono) // hop
    r = np.sqrt((mono[:n * hop].reshape(n, hop) ** 2).mean(1))
    on = np.clip((20 * np.log10(r + 1e-9) + 45) / 15, 0, 1)        # -45 dB = silent, -30 dB and up = talking
    out, v = np.zeros(n), 0.0
    ka, kr = 1 - np.exp(-0.01 / attack), 1 - np.exp(-0.01 / release)
    for i in range(n):
        v += (on[i] - v) * (ka if on[i] > v else kr)
        out[i] = v
    if not n:
        return np.zeros(len(mono))
    e = np.repeat(out, hop)[:len(mono)]
    return np.pad(e, (0, len(mono) - len(e)), mode="edge")      # the last partial hop (length not a multiple of 10 ms)


def shot_starts(story):
    """Each shot's cut time, worked out from words.json exactly as render.py does (so the SFX follow the voice
    even before the frames are rendered)."""
    fps, lead = int(story.get("fps", 30)), float(story.get("cut_lead", 0.07))
    words = json.load(open(os.path.join(BUILD, "words.json"), encoding="utf-8"))["words"]
    out, prev = {}, 0.0
    for i, s in enumerate(story["shots"]):
        ws = [w for w in words if w["shot"] == i]
        t = 0.0 if i == 0 else (max(0.0, ws[0]["t0"] - lead) if ws else prev)
        out[s["id"]] = prev = round(t * fps) / fps
    return out


def main(story_path):
    story = json.load(open(story_path, encoding="utf-8"))
    total = float(story.get("seconds", 20))
    N = int(total * SR)
    shots = shot_starts(story)
    voice = load(os.path.join(BUILD, "vo.wav"))[:N]
    voice = np.pad(voice, ((0, N - len(voice)), (0, 0)))
    vm = voice.mean(1)
    env = envelope(vm)
    v_rms = np.sqrt((vm[env > 0.5] ** 2).mean()) if (env > 0.5).any() else 0.1
    v_peak = np.abs(vm).max() or 1.0
    mix = voice.copy()
    credits = []

    m = story.get("music")
    if m:
        rel, credit = sounds.MUSIC[m["track"]]
        # carve a pocket for the voice (dip 1.5-4 kHz), keep the lows warm and the top airy, so the bed can sit
        # louder without covering words
        eq = m.get("eq", "highpass=f=35,equalizer=f=2600:t=q:w=1.1:g=-5,equalizer=f=9000:t=q:w=1:g=2,"
                         "extrastereo=m=1.3")
        mus = load(sounds.path(rel), m.get("start", 0.0), total + 1, eq)[:N]
        mus = np.pad(mus, ((0, N - len(mus)), (0, 0)))
        m_rms = np.sqrt((mus ** 2).mean()) or 1.0
        g = np.full(N, v_rms * 10 ** (m.get("db", -15) / 20) / m_rms)
        g *= 1 - m.get("duck", 0.35) * env[:N]
        for a, b in m.get("cut", []):
            i0, i1 = int(shots[a] * SR), int(shots[b] * SR)
            fo = int(0.06 * SR)
            g[i0:i0 + fo] *= np.linspace(1, 0, min(fo, N - i0))
            g[i0 + fo:i1] = 0
        g[:int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
        g[N - int(0.25 * SR):] *= np.linspace(1, 0, int(0.25 * SR))
        mix += mus * g[:, None]
        credits.append(credit)

    for c in story.get("sfx", []):
        rel, credit = sounds.SFX[c["s"]]
        s = load(sounds.path(rel), c.get("skip", 0.0), c.get("len"))
        s = fades(s, 0.003, c.get("fade", 0.15) if c.get("len") else 0.01)
        peak = np.abs(s).max() or 1.0
        s *= v_peak * 10 ** (c.get("db", -8) / 20) / peak
        pan = c.get("pan", 0.0)
        s[:, 0] *= min(1.0, 1 - pan)
        s[:, 1] *= min(1.0, 1 + pan)
        i = int((shots[c["shot"]] + c.get("dt", 0.0)) * SR)
        j0 = max(0, -i)
        i = max(0, i)
        n = min(len(s) - j0, N - i)
        if n > 0:
            mix[i:i + n] += s[j0:j0 + n]
        if credit:
            credits.append(credit)

    peak = np.abs(mix).max()
    if peak > 0.98:                                   # soft safety; finish.py sets the final loudness
        mix *= 0.98 / peak
    out = os.path.join(BUILD, "mix.wav")
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                          "-c:a", "pcm_s16le", out], stdin=subprocess.PIPE)
    p.communicate(mix.astype(np.float32).tobytes())
    credits = list(dict.fromkeys(credits))
    with open(os.path.join(BUILD, "credits.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(credits) + ("\n" if credits else ""))
    print(f"wrote {out}: music {m['track'] if m else 'none'}, {len(story.get('sfx', []))} sfx; "
          f"credits: {len(credits)} line(s)")


if __name__ == "__main__":
    main(sys.argv[1])

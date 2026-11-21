# Original score for the race short: generative, all-synthesized (numpy/scipy). Energetic pulsing
# tech bed with a warm resolution; acts follow the story. Returns a mono stem (mix.py places/levels it).
import numpy as np
from dsp import SR, ns, dbg, rng, lp, hp, bp, place, pan, fades, ramp, smooth_noise, st
from instruments import pad, pluck, glock, vibes, timpani, snare, cymbal
from timeline_race import DUR, ACTS, act_t, SHOTS, fr, SCENE

R = rng(20261112)
BPM = 104.0
BEAT = 60.0 / BPM

# chord roots (Hz) per act: [bass, third, fifth, seventh?]
CHORDS = {
    "intro": [(110.0, 130.8, 164.8, 220.0), (110.0, 130.8, 164.8, 220.0)],
    "post":  [(110.0, 130.8, 164.8, 220.0), (87.3, 110.0, 130.8, 174.6)],
    "build": [(110.0, 130.8, 164.8, 220.0), (87.3, 110.0, 130.8, 174.6),
              (65.4, 98.0, 130.8, 196.0), (98.0, 123.5, 146.8, 196.0)],
    "data":  [(73.4, 87.3, 110.0, 146.8), (58.3, 73.4, 87.3, 116.5),
              (65.4, 87.3, 98.0, 130.8), (87.3, 110.0, 130.8, 174.6)],
    "home":  [(87.3, 110.0, 130.8, 174.6), (65.4, 98.0, 130.8, 196.0),
              (110.0, 130.8, 164.8, 220.0), (98.0, 123.5, 146.8, 196.0)],
    "drive": [(110.0, 130.8, 164.8, 220.0), (87.3, 110.0, 130.8, 174.6),
              (65.4, 98.0, 130.8, 196.0), (98.0, 123.5, 146.8, 196.0)],
    "boom":  [(110.0, 130.8, 164.8, 220.0), (110.0, 130.8, 164.8, 220.0)],
    "chase": [(82.4, 98.0, 123.5, 164.8), (65.4, 82.4, 98.0, 130.8), (73.4, 87.3, 110.0, 146.8)],
    "outro": [(65.4, 98.0, 130.8, 196.0), (98.0, 123.5, 146.8, 196.0),
              (110.0, 130.8, 164.8, 220.0), (87.3, 110.0, 130.8, 174.6)],
}

# loudness per act (LU relative to the voice bed; lower = quieter)
ACT_LEVEL = {"intro": -13.0, "post": -13.0, "build": -11.5, "data": -11.0, "home": -13.5,
             "drive": -10.5, "boom": -11.0, "chase": -10.5, "outro": -12.5}

# percussion per act
DRUMS = {"intro": "sparse", "post": "sparse", "build": "full", "data": "lite", "home": "none",
         "drive": "full", "boom": "sparse", "chase": "full", "outro": "lite"}


def _bass(f0, dur, vel=0.55):
    n = ns(dur)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f0 * t) * vel
    x += 0.35 * np.sin(2 * np.pi * f0 * 0.5 * t) * vel
    # soft envelope: quick attack, sustain, release
    e = np.ones(n)
    a = int(0.012 * SR); r = int(0.25 * SR)
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r)
    x *= e
    return x


def _hat(dur=0.05, vel=0.3):
    n = ns(dur)
    x = np.zeros(n)
    for i in range(40):
        a = int(R.random() * n)
        nn = min(ns(0.004), n - a)
        x[a:a + nn] += (R.random() * 2 - 1) * 0.25
    x = hp(x, 6000, 2) * vel
    return x


def _arp(chord, start, end, vel=0.35, every=0.5, voice="pluck"):
    n = ns(DUR)
    x = np.zeros(n)
    t0 = start
    i = 0
    while t0 < end:
        f = chord[i % len(chord)] * 2.0
        if voice == "glock":
            s = glock(f, vel=vel, r=R, dur=1.2)
        else:
            s = pluck(f, vel=vel, r=R, dur=0.8)
        a = int(t0 * SR)
        if a + len(s) > n:
            s = s[: n - a]
        x[a:a + len(s)] += s
        t0 += every * BEAT
        i += 1
    return x


def build():
    n = ns(DUR)
    x = np.zeros(n)
    pad_buf = np.zeros((2, n))
    for a, b, name in ACTS:
        t0, t1 = act_t(name)
        a0, a1 = int(t0 * SR), int(t1 * SR)
        chords = CHORDS[name]
        # pad
        for cidx, chord in enumerate(chords):
            bar = (t1 - t0) / len(chords)
            ct0 = t0 + cidx * bar
            p = pad([f for f in chord], bar * 1.15, vel=0.30, r=R, att=bar * 0.35, rel=bar * 0.5,
                    warm=750.0, detune=6.0)
            ca = int(ct0 * SR)
            if ca + p.shape[1] <= n:
                pad_buf[:, ca:ca + p.shape[1]] += p
        # bass pulse + arp
        beat_t = t0
        bi = 0
        drive = name in ("build", "drive", "chase")
        while beat_t < t1:
            chord = chords[int(bi / 4) % len(chords)]
            bassf = chord[0] * 0.5 if name != "intro" else chord[0]
            if not (name == "home" and bi % 4 == 2):
                bs = _bass(bassf, BEAT * 0.9, vel=0.6 if drive else 0.4)
                ba = int(beat_t * SR)
                if ba + len(bs) <= n:
                    x[ba:ba + len(bs)] += bs
            # hats / snare / kick accents
            if DRUMS[name] == "full":
                if bi % 4 == 0:
                    k = timpani(chord[0] * 0.5, vel=0.8, r=R, dur=1.2)
                    ka = int((beat_t) * SR)
                    if ka + len(k) <= n:
                        x[ka:ka + len(k)] += k * 0.5
                if bi % 4 == 2:
                    s = snare(vel=0.55, r=R, dur=0.3, tune=1.3)
                    sa = int((beat_t + BEAT * 0.5) * SR)
                    if sa + len(s) <= n:
                        x[sa:sa + len(s)] += s * 0.5
            elif DRUMS[name] in ("lite", "sparse"):
                if bi % 4 == 0 and name != "intro":
                    k = timpani(chord[0] * 0.5, vel=0.5, r=R, dur=0.9)
                    ka = int(beat_t * SR)
                    if ka + len(k) <= n:
                        x[ka:ka + len(k)] += k * 0.3
            if bi % 2 == 1 and drive:
                h = _hat()
                ha = int((beat_t + BEAT * 0.5) * SR)
                if ha + len(h) <= n:
                    x[ha:ha + len(h)] += h
            beat_t += BEAT
            bi += 1
        # arpeggios for definition acts
        if name in ("post", "build", "data", "drive", "chase", "boom", "outro"):
            x += _arp(chords[0], t0, t1, vel=0.30 if name != "drive" else 0.38,
                      every=0.5 if name in ("drive", "chase") else 1.0,
                      voice="glock" if name in ("data", "boom", "outro") else "pluck")
    # global soft lowpass for warmth
    x = lp(x, 9000, 2)
    x = fades(x, 0.10, 1.5)
    # stereo: mono core + warm pad bed
    out = st(x).T + pad_buf.T * 0.8
    # normalize to a gentle RMS so mix.py can set absolute levels
    rms = float(np.sqrt(np.mean(out ** 2)))
    out = out / (rms + 1e-9) * 0.08
    return out

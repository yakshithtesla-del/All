# Synthesized SFX for the race short (all original, numpy/scipy). Every function returns mono or stereo
# float32 at SR=48000; mix_race.py places/scales them.
import numpy as np
from dsp import (SR, ns, dbg, rng, lp, hp, bp, peq, reson, colored, smooth_noise, ramp,
                 fades, phase, modal, place, pan, st, widen)
from sfx_gen import whoosh as _whoosh, applause as _applause, clink as _clink

R = rng(20261111)


def _f(f0, f1, dur):
    n = ns(dur)
    return np.geomspace(max(f0, 20), max(f1, 20), n)


# ---------------- ambiences ----------------
def rain(dur=71.0, level=1.0):
    n = ns(dur)
    x = colored(n, R, slope=-0.9, lo=400.0) * 0.5
    x = bp(x, 900, 6000, 2)
    # amplitude wobble (gusts)
    m = 0.7 + 0.3 * smooth_noise(n, R, 0.6, ctrl=3.0)
    x *= m
    x = fades(x, 1.0, 1.5)
    # decorrelated stereo (cheap widen)
    d = int(0.011 * SR)
    xl = x
    xr = np.concatenate([np.zeros(d), x[:-d]]) if d > 0 else x
    out = np.stack([xl, xr], axis=1) * level
    return out


def tv_room(dur=4.0, level=0.5):
    n = ns(dur)
    x = colored(n, R, slope=-0.5, lo=60.0)
    x = lp(x, 4000, 2)
    x += 0.06 * np.sin(2 * np.pi * 120 * np.arange(n) / SR)
    x *= ramp(n, kind="cos")
    return st(x) * level


# ---------------- one-shots ----------------
def pop(bright=1.0, dur=0.45):
    n = ns(dur)
    t = np.arange(n) / SR
    f0 = 700 * bright
    x = np.sin(2 * np.pi * f0 * t) * np.exp(-t * 14) * 0.5
    x += np.sin(2 * np.pi * f0 * 1.5 * t) * np.exp(-t * 22) * 0.25
    x += colored(n, R, slope=-1.2, lo=900) * np.exp(-t * 30) * 0.3
    x = fades(x, 0.002, 0.05)
    return st(x)


def ding(bright=0.9, dur=1.1):
    n = ns(dur)
    f0 = 880 * bright
    x = _clink(R, f0=f0, dur=dur, bright=bright)
    x = x * ramp(n, kind="cos")
    return st(x)


def shimmer(dur=1.4, vel=0.5):
    notes = [1568, 2093, 2637, 3136]
    n = ns(dur)
    x = np.zeros(n)
    for i, f in enumerate(notes):
        t0 = i * ns(0.16)
        if t0 >= n:
            break
        nn = min(ns(0.9), n - t0)
        tt = np.arange(nn) / SR
        xx = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 7) * vel
        xx += np.sin(2 * np.pi * f * 2.01 * tt) * np.exp(-tt * 9) * 0.3 * vel
        x[t0:t0 + nn] += xx
    return st(x * 0.6)


def scratch(dur=1.6):
    n = ns(dur)
    f = _f(1400, 2600, dur)
    x = colored(n, R, slope=-0.4, lo=600)
    x = bp(x, 1800, 5200, 2)
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 11 * np.arange(n) / SR)  # hand wobble
    x *= ramp(n, kind="cos")
    x = bp(x, 1500, 4500, 1)
    return st(x * 0.7)


def ruckle(dur=4.0, dir=1):
    n = ns(dur)
    t = np.arange(n) / SR
    rumble = colored(n, R, slope=-1.6, lo=25)
    rumble = lp(rumble, 110, 2) * 1.4
    engine = np.sin(2 * np.pi * (42 + 8 * np.sin(2 * np.pi * 3.1 * t))) * 0.25
    x = rumble * (0.6 + 0.4 * ramp(n, kind="cos")) + engine * ramp(n, kind="cos")
    x = fades(x, 0.6, 0.8) * 0.9
    a = 0.15 * dir
    return np.stack([x * (1 - a), x * (1 + a)], axis=1)


def beep(dur=0.8):
    n = ns(dur)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f0, d0, g in [(980, 0.12, 0.5), (1310, 0.42, 0.5)]:
        a, b = int(d0 * SR), min(int((d0 + 0.13) * SR), n)
        x[a:b] += np.sin(2 * np.pi * f0 * t[a:b]) * g
    x *= ramp(n, kind="cos") * 0.4
    return st(x)


def humm(dur=3.0):
    n = ns(dur)
    t = np.arange(n) / SR
    f = 90 + 220 * smooth_noise(n, R, 1.4, ctrl=2.0)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * 0.4 + np.sin(2 * ph) * 0.15 + np.sin(2 * np.pi * 60 * t) * 0.08
    x *= ramp(n, kind="cos")
    x = fades(x, 0.4, 0.4)
    return st(x)


def notify(dur=1.2):
    n = ns(dur)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f0, d0 in [(1245, 0.05), (1568, 0.30)]:
        a, b = int(d0 * SR), min(int((d0 + 0.28) * SR), n)
        x[a:b] += np.sin(2 * np.pi * f0 * t[a:b]) * 0.5 * np.exp(-np.arange(b - a) / SR * 9)
    return st(x * 0.7)


def thump(dur=1.0):
    n = ns(dur)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * (70 - 30 * np.exp(-t * 12)) * t) * np.exp(-t * 8) * 0.9
    x += colored(n, R, slope=-1.0, lo=80) * np.exp(-t * 16) * 0.3
    return st(x)


def buzz(dur=2.4):
    n = ns(dur)
    t = np.arange(n) / SR
    sq = np.sign(np.sin(2 * np.pi * 130 * t))
    x = sq * 0.25 * (0.6 + 0.4 * np.sin(2 * np.pi * 21 * t))
    x = lp(x, 900, 2)
    x *= ramp(n, kind="cos")
    x = fades(x, 0.05, 0.2)
    return st(x)


def steps(dur=4.0, nstep=6):
    n = ns(dur)
    x = np.zeros(n)
    for i in range(nstep):
        t0 = i * dur / nstep
        a = int(t0 * SR)
        nn = min(ns(0.28), n - a)
        tt = np.arange(nn) / SR
        x[a:a + nn] += np.sin(2 * np.pi * (60 - 25 * np.exp(-tt * 18)) * tt) * np.exp(-tt * 16) * 0.55
        x[a:a + nn] += colored(nn, R, slope=-0.8, lo=120) * np.exp(-tt * 30) * 0.2
    x *= ramp(n, kind="cos")
    return np.stack([x * 0.92, x * 1.08], axis=1)


def flip(dur=0.7):
    n = ns(dur)
    f = _f(900, 2600, dur)
    x = colored(n, R, slope=-0.6, lo=400)
    x = bp(x, 800, 4000, 2)
    x *= np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + 0.6
    x *= ramp(n, kind="cos")
    return st(x * 0.8)


def typing(dur=2.2, nkey=14):
    n = ns(dur)
    x = np.zeros(n)
    for i in range(nkey):
        a = int((i * dur / nkey + 0.04 * R.random()) * SR)
        nn = min(ns(0.05), n - a)
        tt = np.arange(nn) / SR
        x[a:a + nn] += colored(nn, R, slope=-0.7, lo=800) * np.exp(-tt * 90) * 0.5
    return st(x * 0.5)


def chime(dur=2.4):
    notes = [880, 1108, 1318, 1760]
    n = ns(dur)
    x = np.zeros(n)
    for i, f in enumerate(notes):
        a = int((0.15 + i * 0.2) * SR)
        nn = min(ns(1.2), n - a)
        tt = np.arange(nn) / SR
        x[a:a + nn] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 5) * 0.4
        x[a:a + nn] += np.sin(2 * np.pi * f * 2.0 * tt) * np.exp(-tt * 7) * 0.15
    return st(x * 0.7)


def swoosh(dur=2.6):
    x = _whoosh(dur, R, peak=0.5, f_lo=300, f_hi=2600, width=0.9, tail=0.3, air=0.2)
    return st(x) * 1.2


def boom(dur=3.6):
    n = ns(dur)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * (52 - 22 * np.exp(-t * 10)) * t) * np.exp(-t * 4.5) * 1.1
    x += colored(n, R, slope=-1.4, lo=30) * np.exp(-t * 7) * 0.8
    x = lp(x, 220, 2)
    # shimmer tail (mono average)
    tail = shimmer(dur=2.2, vel=0.35).mean(axis=0)
    n2 = len(tail)
    x[n - n2:] += tail * 0.6
    return np.stack([x, x], axis=1)


def chimearp(dur=3.6):
    notes = [1047, 1319, 1568, 2093, 2637, 3136]
    n = ns(dur)
    x = np.zeros(n)
    for i, f in enumerate(notes):
        a = int((0.1 + i * 0.24) * SR)
        nn = min(ns(1.6), n - a)
        tt = np.arange(nn) / SR
        x[a:a + nn] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 4.5) * 0.4
        x[a:a + nn] += np.sin(2 * np.pi * f * 2.003 * tt) * np.exp(-tt * 6.5) * 0.14
    return st(x * 0.8)


def cars(dur=5.0):
    n = ns(dur)
    x = np.zeros((n, 2))
    # left->right pass (mono whoosh, panned wide right)
    a = int(0.4 * SR)
    nn = n - a
    wh = _whoosh(nn / SR, R, peak=0.6, f_lo=240, f_hi=1500, width=1.0, tail=0.2, air=0.15)
    if wh.ndim == 2:
        wh = wh.mean(axis=0)
    x[a:, 0] += wh * 0.25 * 0.7
    x[a:, 1] += wh * 0.95 * 0.7
    # right->left pass
    b = int(2.4 * SR)
    wh2 = _whoosh((n - b) / SR, R, peak=0.5, f_lo=260, f_hi=1400, width=1.0, tail=0.2, air=0.15)
    if wh2.ndim == 2:
        wh2 = wh2.mean(axis=0)
    x[b:, 0] += wh2 * 0.95 * 0.55
    x[b:, 1] += wh2 * 0.25 * 0.55
    return x


def news(dur=7.0, count=4):
    n = ns(dur)
    x = np.zeros(n)
    for i in range(count):
        t0 = 0.6 + i * 1.6 + 0.4 * R.random()
        a = int(t0 * SR)
        nn = min(ns(1.4), n - a)
        f = _f(500, 1900, nn / SR)
        fl = colored(nn, R, slope=-0.5, lo=300)
        fl = bp(fl, 400, 3000, 2)
        fl *= 0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(f) / SR)
        fl *= np.exp(-np.arange(nn) / SR * 2.2)
        x[a:a + nn] += fl * 0.45
    return st(x * 0.8)


def phone(dur=0.9):
    n = ns(dur)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 1180 * t) * np.exp(-t * 10) * 0.35
    x += np.sin(2 * np.pi * 1770 * t) * np.exp(-t * 13) * 0.2
    x += colored(n, R, slope=-0.9, lo=900) * np.exp(-t * 26) * 0.2
    return st(x)


_KINDS = {"rain": rain, "news": news, "phone": phone, "pop": pop, "scratch": scratch,
          "ruckle": ruckle, "beep": beep, "humm": humm, "ding": ding, "shimmer": shimmer,
          "whoosh": lambda dur=2.0, **k: st(_whoosh(dur, R, peak=0.5, f_lo=300, f_hi=2200, width=0.9, tail=0.25, air=0.18)) * 0.9,
          "notify": notify, "thump": thump, "buzz": buzz, "steps": steps, "flip": flip,
          "typing": typing, "chime": chime, "swoosh": swoosh, "boom": boom, "chimearp": chimearp,
          "cars": cars, "tv": tv_room, "applause": lambda dur=30.0, **k: st(_applause(dur, R, people=40)) * 0.7}


def synth(kind, **kw):
    return _KINDS[kind](**kw)

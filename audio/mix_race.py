# Final mix for the race short. Voice = public/voice/voice.wav (gain only), original score (music_race.py)
# ducked under speech, synthesized SFX stem. Master to -15 LUFS integrated, true peak <= -1.2 dBTP.
# Writes mix.wav + stem_voice/music/sfx.wav and prints a loudness report.
import json
import os
import time
import numpy as np
from dsp import (SR, ns, dbg, read_wav, write_wav, integrated, momentary, momentary_max,
                 short_term, lra, true_peak, fades, st)
import timeline_race as T
import music_race as M
import sfx_race as S

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
N = ns(T.DUR)
TARGET_LUFS = -15.0
CEIL_DBTP = -1.2

WORDS = json.load(open(os.path.join(ROOT, "public/voice/words.json")))


def log(*a):
    print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)


def voice_stem():
    data, sr = read_wav(os.path.join(ROOT, "public/voice/voice.wav"))  # (ch, n) float 48k
    assert sr == SR, f"voice sr {sr} != {SR}"
    if data.shape[1] > N:
        data = data[:, :N]
    else:
        data = np.concatenate([data, np.zeros((2, N - data.shape[1]))], axis=1)
    # gain only: bring the voice to ~ -15.5 LUFS integrated (leaves headroom under -15 mix target)
    cur = integrated(data)
    g = dbg(-15.5 - cur)
    return (data.T * g).clip(-1.0, 1.0)


def word_mask():
    m = np.zeros(N)
    for w in WORDS:
        a, b = int(w["start"] * SR), int(w["end"] * SR)
        m[a:b] = 1.0
    return m


CACHE_DIR = os.path.join(HERE, "_cache")


def music_stem():
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_p = os.path.join(CACHE_DIR, "music.npy")
    if os.path.exists(cache_p):
        m = np.load(cache_p)
        log("music stem (cached)")
        return m
    m = M.build()  # (n, 2) stereo (pad bed already widens)
    np.save(cache_p, m)
    log("music stem (recomputed, cached)")
    # per-act level automation (LU relative to voice)
    mask = word_mask()
    # compute voice activity envelope smoothed for ducking
    from scipy.ndimage import gaussian_filter1d
    env = gaussian_filter1d(mask, int(0.08 * SR))
    duck = 1.0 - 0.42 * env          # up to ~3.2 dB dip under speech
    # act levels
    level = np.ones(N)
    for a, b, name in T.ACTS:
        t0, t1 = T.act_t(name)
        l0, l1 = int(t0 * SR), int(t1 * SR)
        level[l0:l1] = dbg(M.ACT_LEVEL[name] - (-15.5))  # relative to voice gain
    # smooth level changes
    level = gaussian_filter1d(level, int(0.5 * SR))
    m *= (level[:, None] * duck[:, None])
    m = fades(m, 0.2, 2.0)
    return m


def _norm_stereo(s):
    s = np.asarray(s, dtype=np.float64)
    while s.ndim > 2 and s.shape[-1] != 2:
        s = s[..., 0]
    if s.ndim >= 3:
        s = s.reshape(-1, s.shape[-1])
    if s.ndim == 1:
        s = st(s).T
    elif s.shape[0] == 2 and s.shape[1] != 2:
        s = s.T
    if s.shape[1] != 2:
        s = np.stack([s[:, 0], s[:, 0]], axis=1)
    return s


def sfx_stem():
    x = np.zeros((N, 2))
    os.makedirs(CACHE_DIR, exist_ok=True)
    for (t0, t1, kind, kw) in T.SFX:
        a = int(t0 * SR)
        key = f"{kind}|{int(t0 * 1000)}"
        cp = os.path.join(CACHE_DIR, "sfx_" + key + ".npy")
        if os.path.exists(cp):
            s = np.load(cp)
        else:
            s = _norm_stereo(S.synth(kind, **kw))
            np.save(cp, s)
        if a + len(s) > N:
            s = s[: N - a]
        g = kw.get("gain", 1.0)
        x[a:a + len(s)] += s * g
    # sfx bus: gentle highpass to keep sub rumble from eating headroom
    from dsp import hp
    x[:, 0] = hp(x[:, 0], 30, 2)
    x[:, 1] = hp(x[:, 1], 30, 2)
    x = fades(x.T, 0.01, 0.5).T   # fades expects channel-first
    return x


def write_wav_safe(path, x):
    """24-bit stereo WAV writer (dsp.write_wav's header packing fails on this env)."""
    import wave
    x = np.asarray(x, dtype=np.float64)
    if x.shape[1] != 2:
        x = x.T
    n, ch = x.shape
    q = np.clip(np.round(x * 8388607.0), -8388608, 8388607).astype("<i4")
    q = q.view(np.uint32)
    data = np.empty((n, ch, 3), dtype=np.uint8)
    data[..., 0] = q & 0xff
    data[..., 1] = (q >> 8) & 0xff
    data[..., 2] = (q >> 16) & 0xff
    with wave.open(path, "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def limiter(x, ceil=CEIL_DBTP):
    # soft-knee lookahead-ish limiter: peak normalize with tanh fold
    peak = float(np.max(np.abs(x)))
    target = dbg(ceil)
    if peak < 1e-7:
        return x
    k = np.clip(target / peak, 0.001, 1.0)
    y = x * k
    # gentle tanh fold only on the top 3 dB
    hot = np.abs(y) > target * 0.7
    y[hot] = np.tanh(y[hot] / target) * target
    # re-check peak
    p2 = float(np.max(np.abs(y)))
    if p2 > target:
        y *= target / p2
    return y


def main():
    log("voice stem")
    vo = voice_stem()
    log("music stem")
    mu = music_stem()
    log("sfx stem")
    fx = sfx_stem()
    # level the SFX bed under the voice (target integrated LUFS; -6 dB standard relative to the voice bed)
    sfx_i = integrated(fx.T)
    fx = fx * dbg(-21.0 - sfx_i)
    log(f"sfx leveled {sfx_i:.2f} -> -21.00 LUFS")
    mix = vo + mu + fx
    log("master limit")
    mix = limiter(mix)
    # normalize integrated to target (meters want channel-first)
    cur = integrated(mix.T)
    mix = mix * dbg(TARGET_LUFS - cur)
    mix = limiter(mix)
    os.makedirs(os.path.join(ROOT, "public/audio"), exist_ok=True)
    write_wav_safe(os.path.join(ROOT, "public/audio/mix.wav"), mix)
    write_wav_safe(os.path.join(ROOT, "public/audio/stem_voice.wav"), vo)
    write_wav_safe(os.path.join(ROOT, "public/audio/stem_music.wav"), mu)
    write_wav_safe(os.path.join(ROOT, "public/audio/stem_sfx.wav"), fx)
    print("\n=== LOUDNESS ===")
    print(f"mix  integrated {integrated(mix.T):6.2f} LUFS  peak {true_peak(mix.T):6.2f} dBTP  LRA {lra(mix.T):4.2f} LU")
    print(f"voice integrated {integrated(vo.T):6.2f} LUFS  peak {true_peak(vo.T):6.2f} dBTP")
    print(f"music integrated {integrated(mu.T):6.2f} LUFS  peak {true_peak(mu.T):6.2f} dBTP")
    print(f"sfx  integrated {integrated(fx.T):6.2f} LUFS  peak {true_peak(fx.T):6.2f} dBTP")
    print("done")


if __name__ == "__main__":
    main()

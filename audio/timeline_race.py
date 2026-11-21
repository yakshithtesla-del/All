# Race short picture timeline for the soundtrack: mirrors src/videos/race/story.ts frames exactly
# (bounds computed from words.json anchors, same algorithm as story.ts).
import numpy as np

FPS = 30
TOTAL = 3402
DUR = TOTAL / FPS            # 113.4 s exactly
fr = lambda f: f / FPS

# shot id -> (first frame, end frame) (from story.ts A anchor table, verified ascending)
_B = [0, 71, 139, 214, 294, 384, 430, 469, 499, 611, 697, 808, 868, 926, 1054, 1146,
      1268, 1366, 1448, 1516, 1567, 1626, 1689, 1737, 1793, 1877, 2060, 2181, 2286,
      2374, 2508, 2567, 2704, 2769, 2818, 2886, 3016, 3161, 3238, 3262, 3402]
SHOTS = {i + 1: (_B[i], _B[i + 1]) for i in range(40)}

# scene label per shot (used by the score)
SCENE = {
    1: "rain", 2: "night", 3: "post", 4: "office", 5: "nvidia", 6: "gate", 7: "tpu", 8: "tpu",
    9: "data", 10: "lib", 11: "lib", 12: "data", 13: "data", 14: "data", 15: "data", 16: "data",
    17: "data", 18: "data", 19: "data", 20: "data", 21: "data", 22: "data", 23: "data", 24: "data",
    25: "data", 26: "bed", 27: "earth", 28: "shelf", 29: "shelf", 30: "apple", 31: "data",
    32: "desk", 33: "laptop", 34: "laptop", 35: "aerial", 36: "argon", 37: "quantum", 38: "track",
    39: "data", 40: "couch",
}

# music acts: (first shot, last shot, act name)
ACTS = [
    (1, 3, "intro"), (4, 8, "build"), (9, 25, "data"), (26, 29, "home"),
    (30, 35, "drive"), (36, 36, "boom"), (37, 38, "chase"), (39, 40, "outro"),
]


def act_t(name):
    for a, b, n in ACTS:
        if n == name:
            return fr(SHOTS[a][0]), fr(SHOTS[b][1])
    raise KeyError(name)


def shot_t(i):
    a, b = SHOTS[i]
    return fr(a), fr(b)


def shot_at(t):
    f = t * FPS
    for i, (a, b) in SHOTS.items():
        if a <= f < b:
            return i
    return 40


# ---- SFX cue map: (start, end, kind, kwargs) in SECONDS, absolute ------------------------------
SFX = [
    (fr(0), fr(71), "rain", {}),
    (fr(35), fr(42), "news", {"count": 4}),
    (fr(75), fr(82), "phone", {}),
    (fr(139), fr(140.5), "pop", {"bright": 1.0}),
    (fr(250), fr(252), "scratch", {}),
    (fr(294), fr(298), "ruckle", {"dir": 1}),
    (fr(384), fr(388), "beep", {}),
    (fr(430), fr(433), "humm", {}),
    (fr(469), fr(472), "ding", {"bright": 0.8}),
    (fr(512), fr(513.5), "shimmer", {}),
    (fr(611), fr(614), "whoosh", {"dur": 2.0}),
    (fr(697), fr(700), "whoosh", {"dur": 2.0}),
    (fr(808), fr(809.5), "shimmer", {}),
    (fr(926), fr(928), "whoosh", {"dur": 1.8}),
    (fr(1054), fr(1055.5), "ding", {"bright": 0.9}),
    (fr(1146), fr(1147.5), "ding", {"bright": 0.9}),
    (fr(1268), fr(1269.5), "ding", {"bright": 0.9}),
    (fr(1366), fr(1367.5), "ding", {"bright": 0.9}),
    (fr(1448), fr(1449.5), "ding", {"bright": 0.9}),
    (fr(1516), fr(1517.5), "ding", {"bright": 0.9}),
    (fr(1567), fr(1568.5), "ding", {"bright": 0.9}),
    (fr(1626), fr(1627.5), "ding", {"bright": 0.9}),
    (fr(1689), fr(1690.5), "ding", {"bright": 0.9}),
    (fr(1737), fr(1738.5), "ding", {"bright": 0.9}),
    (fr(1793), fr(1794.5), "ding", {"bright": 0.9}),
    (fr(1877), fr(1879), "notify", {}),
    (fr(2060), fr(2063), "whoosh", {"dur": 2.6}),
    (fr(2181), fr(2183), "thump", {}),
    (fr(2286), fr(2289), "buzz", {}),
    (fr(2374), fr(2378), "steps", {}),
    (fr(2508), fr(2510), "whoosh", {"dur": 1.8}),
    (fr(2567), fr(2569), "flip", {}),
    (fr(2704), fr(2706), "typing", {}),
    (fr(2769), fr(2772), "chime", {}),
    (fr(2818), fr(2821), "swoosh", {}),
    (fr(2886), fr(2890), "boom", {}),
    (fr(3016), fr(3020), "chimearp", {}),
    (fr(3161), fr(3166), "cars", {}),
    (fr(3262), fr(3265), "tv", {}),
    (fr(3360), fr(3390), "applause", {}),
]

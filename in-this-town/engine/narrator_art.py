"""The kit's narrator "Pip" (2D art). Drawn from scratch for this kit: warm brown skin, round eyes with a white
shine, soft arched brows, freckles, an orange hoodie with a gold star patch. On the 3D rig he wears a purple
beanie with a pom-pom (built in engine/cast.py).

python engine/narrator_art.py  ->  work/narrator/faces/<name>.png (1024 square, transparent),
                                   work/narrator/faces/sheet.png, work/narrator/hoodie.png (585x559 shirt template)
Faces: smirk grin happy laugh shock scared sad angry (the names the stories use for the narrator)."""
import os, math
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "work", "narrator")
N, S = 1024, 4
INK = (34, 20, 22, 255)
SHINE = (255, 255, 255, 255)
MOUTH = (110, 24, 34, 255)
TEETH = (252, 248, 240, 255)
TONGUE = (232, 104, 112, 255)
FRECKLE = (120, 64, 40, 150)
LX, RX, EY = 0.36, 0.64, 0.48


def P(x, y):
    return (x * N * S, y * N * S)


def W(v):
    return int(v * N * S)


def eye(d, cx, cy, r=0.058, squash=1.0, shine=True):
    """Round eye with a shine dot (top right)."""
    d.ellipse([P(cx - r, cy - r * squash), P(cx + r, cy + r * squash)], fill=INK)
    if shine:
        d.ellipse([P(cx + r * 0.15, cy - r * 0.62 * squash), P(cx + r * 0.6, cy - r * 0.17 * squash)], fill=SHINE)


def brow(d, cx, cy, tilt=0.0, w=0.075, lift=0.0):
    """A soft arched brow; tilt > 0 lowers the inner end (angry), < 0 raises it (worried)."""
    inner = 1 if cx < 0.5 else -1
    pts = []
    for i in range(13):
        u = i / 12
        x = cx - w + 2 * w * u
        y = cy - lift - 0.018 * math.sin(u * math.pi)
        side = (x - cx) * inner / w           # -1 outer .. +1 inner
        y += tilt * 0.035 * side
        pts.append(P(x, y))
    d.line(pts, fill=INK, width=W(0.022), joint="curve")


def brows(d, tilt=0.0, lift=0.0):
    brow(d, LX, EY - 0.115, tilt, lift=lift)
    brow(d, RX, EY - 0.115, tilt, lift=lift)


def freckles(d):
    for cx in (LX, RX):
        for dx, dy in ((-0.035, 0.085), (0.0, 0.1), (0.035, 0.085)):
            d.ellipse([P(cx + dx - 0.007, EY + dy - 0.007), P(cx + dx + 0.007, EY + dy + 0.007)], fill=FRECKLE)


def smile(d, x0, x1, y, depth, thick):
    pts = []
    for i in range(25):
        u = i / 24
        pts.append(P(x0 + (x1 - x0) * u, y + depth * math.sin(u * math.pi)))
    d.line(pts, fill=INK, width=W(thick), joint="curve")


def open_mouth(d, box, teeth=True, tongue=True):
    d.chord([P(*box[:2]), P(*box[2:])], 0, 180, fill=MOUTH, outline=INK, width=W(0.016))
    x0, y0, x1, y1 = box
    ym = (y0 + y1) / 2
    if teeth:
        d.rectangle([P(x0 + 0.03, ym + 0.004), P(x1 - 0.03, ym + 0.03)], fill=TEETH)
    if tongue:
        d.ellipse([P((x0 + x1) / 2 - 0.05, y1 - 0.07), P((x0 + x1) / 2 + 0.05, y1 - 0.012)], fill=TONGUE)


def face(name):
    im = Image.new("RGBA", (N * S, N * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    freckles(d)
    if name == "smirk":
        brows(d, 0.3)
        eye(d, LX, EY, squash=0.85); eye(d, RX, EY)
        smile(d, 0.47, 0.66, 0.68, 0.03, 0.022)
        d.line([P(0.66, 0.68), P(0.685, 0.665)], fill=INK, width=W(0.02))
    elif name == "grin":
        brows(d, 0.0, 0.01)
        eye(d, LX, EY); eye(d, RX, EY)
        open_mouth(d, (0.39, 0.58, 0.61, 0.8), tongue=False)
    elif name == "happy":
        brows(d, -0.2, 0.015)
        for cx in (LX, RX):
            d.arc([P(cx - 0.055, EY - 0.04), P(cx + 0.055, EY + 0.06)], 200, 340, fill=INK, width=W(0.024))
        smile(d, 0.41, 0.59, 0.67, 0.06, 0.026)
    elif name == "laugh":
        brows(d, -0.3, 0.025)
        for cx in (LX, RX):                       # squeezed shut: > <
            s = 1 if cx < 0.5 else -1
            d.line([P(cx - 0.045 * s, EY - 0.035), P(cx + 0.03 * s, EY), P(cx - 0.045 * s, EY + 0.035)],
                   fill=INK, width=W(0.026), joint="curve")
        open_mouth(d, (0.36, 0.55, 0.64, 0.86))
    elif name == "shock":
        brows(d, -0.4, 0.04)
        eye(d, LX, EY, 0.066); eye(d, RX, EY, 0.066)
        d.ellipse([P(0.46, 0.65), P(0.54, 0.77)], fill=MOUTH, outline=INK, width=W(0.016))
    elif name == "scared":
        brows(d, -0.9, 0.02)
        eye(d, LX, EY, 0.045); eye(d, RX, EY, 0.045)
        pts = [(0.41 + i * 0.0225, 0.71 + (0.014 if i % 2 else -0.014)) for i in range(9)]
        d.line([P(*p) for p in pts], fill=INK, width=W(0.02), joint="curve")
    elif name == "sad":
        brows(d, -0.8)
        eye(d, LX, EY + 0.01, squash=0.9); eye(d, RX, EY + 0.01, squash=0.9)
        smile(d, 0.43, 0.57, 0.74, -0.035, 0.022)
        d.ellipse([P(RX + 0.03, EY + 0.07), P(RX + 0.055, EY + 0.11)], fill=(120, 190, 255, 230))   # a tear
    elif name == "angry":
        brows(d, 1.0)
        eye(d, LX, EY + 0.01, 0.048); eye(d, RX, EY + 0.01, 0.048)
        smile(d, 0.43, 0.57, 0.74, -0.03, 0.024)
    return im.resize((N, N), Image.LANCZOS)


NAMES = ["smirk", "grin", "happy", "laugh", "shock", "angry", "scared", "sad"]

# ---------------------------------------------------------------- hoodie (classic shirt template layout)
TORSO = {"F": (231, 74, 128, 128), "B": (427, 74, 128, 128), "R": (165, 74, 64, 128), "L": (361, 74, 64, 128),
         "U": (231, 8, 128, 64), "D": (231, 204, 128, 64)}
ARMS = [(19, 355), (85, 355), (151, 355), (217, 355), (308, 355), (374, 355), (440, 355), (506, 355)]
ARM_UD = [(217, 289), (217, 485), (308, 289), (308, 485)]
BASE, DARK, LIGHT = (236, 104, 28), (176, 66, 14), (252, 146, 62)
GOLD, GOLD_D = (255, 205, 64), (196, 136, 20)


def star(d, cx, cy, r, fill, outline=None):
    pts = []
    for i in range(10):
        a = math.radians(-90 + i * 36)
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    d.polygon(pts, fill=fill, outline=outline)


def hoodie():
    im = Image.new("RGBA", (585, 559), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for k, (x, y, w, h) in TORSO.items():
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=BASE + (255,))
        if k in ("F", "B", "L", "R"):
            d.rectangle([x, y + h - 12, x + w - 1, y + h - 1], fill=DARK + (255,))
            for i in range(x + 3, x + w, 6):
                d.line([i, y + h - 11, i, y + h - 2], fill=BASE + (255,), width=1)
            d.rectangle([x, y, x + 3, y + h - 13], fill=DARK + (255,))
            d.rectangle([x + w - 4, y, x + w - 1, y + h - 13], fill=DARK + (255,))
    x, y, w, h = TORSO["F"]
    d.polygon([(x + 26, y + 72), (x + w - 26, y + 72), (x + w - 14, y + 114), (x + 14, y + 114)], fill=DARK + (255,))
    d.polygon([(x + 30, y + 76), (x + w - 30, y + 76), (x + w - 19, y + 110), (x + 19, y + 110)], fill=LIGHT + (255,))
    d.ellipse([x + 70, y + 18, x + 104, y + 52], fill=(40, 28, 60, 255))           # round patch with a gold star
    star(d, x + 87, y + 35, 14, GOLD + (255,), GOLD_D + (255,))
    for ex in (x + 46, x + w - 46):
        d.ellipse([ex - 5, y + 6, ex + 5, y + 16], fill=DARK + (255,))
    for (ax, ay) in ARMS:                                                         # sleeves with a purple band
        d.rectangle([ax, ay, ax + 63, ay + 127], fill=BASE + (255,))
        d.rectangle([ax, ay + 70, ax + 63, ay + 82], fill=(92, 52, 160, 255))
        d.rectangle([ax, ay + 115, ax + 63, ay + 127], fill=DARK + (255,))
    for (ax, ay) in ARM_UD:
        d.rectangle([ax, ay, ax + 63, ay + 63], fill=BASE + (255,))
    return im


if __name__ == "__main__":
    os.makedirs(os.path.join(OUT, "faces"), exist_ok=True)
    tile = 256
    sheet = Image.new("RGBA", (tile * len(NAMES), tile), (150, 98, 66, 255))
    for i, n in enumerate(NAMES):
        im = face(n)
        im.save(os.path.join(OUT, "faces", n + ".png"))
        sheet.alpha_composite(im.resize((tile, tile), Image.LANCZOS), (i * tile, 0))
    sheet.save(os.path.join(OUT, "faces", "sheet.png"))
    hoodie().save(os.path.join(OUT, "hoodie.png"))
    print("wrote", len(NAMES), "faces and the hoodie to", OUT)

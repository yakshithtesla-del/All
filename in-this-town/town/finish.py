"""Step 3. Finish (the kit's rt_finish.py, ported from OpenCV to PIL + numpy): glow + colour grade, captions
(2-3 words, white with a black edge, the spoken word yellow), speed lines on the hook, white flashes into chosen
shots, then the mp4 with the sound mix (voice + music + SFX from audio.py).
python town/finish.py town/stories/<story>.json [--preview]
Reads town/build/frames/f_#####.jpg, words.json, shots.json, vo.wav. Writes town/build/FINAL.mp4 (or preview.mp4)."""
import sys, os, json, subprocess, re, math
import numpy as np
import audio
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.environ.get("PLANET_BUILD", os.path.join(HERE, "build"))
FONT = os.environ.get("PLANET_FONT", r"C:\Windows\Fonts\seguibl.ttf")   # Segoe UI Black (default Windows font)


def cards(words, max_words=3, max_chars=15):
    """Group words into caption cards: never across a shot or a sentence end."""
    out, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        text_len = sum(len(x["word"]) for x in cur) + len(cur) - 1
        end = (nxt is None or nxt["shot"] != w["shot"] or re.search(r"[.!?,…]$", w["word"]) or len(cur) >= max_words
               or text_len + 1 + len(nxt["word"]) > max_chars)
        if end:
            out.append(cur)
            cur = []
    return out


class Captions:
    def __init__(self, words, W, H, total):
        self.W, self.H = W, H
        self.size = int(W * 0.074)
        self.font = ImageFont.truetype(FONT, self.size)
        self.cards = cards(words)
        self.cache = {}
        self.times = []
        for i, c in enumerate(self.cards):
            t0 = c[0]["t0"] - 0.03
            t1 = self.cards[i + 1][0]["t0"] - 0.03 if i + 1 < len(self.cards) else total
            self.times.append((t0, min(t1, c[-1]["t1"] + 0.45)))

    def _render(self, ci, active):
        key = (ci, active)
        if key in self.cache:
            return self.cache[key]
        c, f, pad = self.cards[ci], self.font, 40
        txt = [re.sub(r"[.,…]+$", "", w["word"]) for w in c]
        space = f.getlength(" ")
        widths = [f.getlength(t) for t in txt]
        lines, lw = [[]], 0
        for i, wd in enumerate(widths):
            if lines[-1] and lw + space + wd > self.W * 0.86:
                lines.append([])
                lw = 0
            lines[-1].append(i)
            lw += wd + (space if len(lines[-1]) > 1 else 0)
        lh = int(self.size * 1.12)
        tw = int(max(sum(widths[i] for i in ln) + space * (len(ln) - 1) for ln in lines)) + pad * 2
        th = lh * len(lines) + pad * 2
        img = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        sw = max(5, int(self.size * 0.09))
        for li, ln in enumerate(lines):
            x = (tw - (sum(widths[i] for i in ln) + space * (len(ln) - 1))) / 2
            y = pad + li * lh - self.size * 0.12
            for i in ln:
                col = (255, 232, 30, 255) if i == active else (255, 255, 255, 255)
                d.text((x + 5, y + 7), txt[i], font=f, fill=(0, 0, 0, 150), stroke_width=sw, stroke_fill=(0, 0, 0, 150))
                d.text((x, y), txt[i], font=f, fill=col, stroke_width=sw, stroke_fill=(0, 0, 0, 255))
                x += widths[i] + space
        self.cache[key] = img
        return img

    def draw(self, frame, t):
        for ci, (t0, t1) in enumerate(self.times):
            if t0 <= t < t1:
                c = self.cards[ci]
                active = -1
                for i, w in enumerate(c):
                    if t >= w["t0"] - 0.03:
                        active = i
                img = self._render(ci, active)
                k = min(1.0, (t - t0) / 0.07)
                sc = 0.82 + 0.18 * (1 - (1 - k) ** 3) + 0.05 * math.sin(k * math.pi)
                if abs(sc - 1) > 0.004:
                    img = img.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))), Image.BILINEAR)
                a = np.asarray(img).astype(np.float32) / 255.0
                h, w = a.shape[:2]
                cx, cy = self.W // 2, int(self.H * 0.68)
                x0, y0 = cx - w // 2, cy - h // 2
                x1, y1 = max(0, x0), max(0, y0)
                x2, y2 = min(self.W, x0 + w), min(self.H, y0 + h)
                sub = a[y1 - y0:y2 - y0, x1 - x0:x2 - x0]
                reg = frame[y1:y2, x1:x2]
                al = sub[..., 3:4]
                reg[:] = reg * (1 - al) + sub[..., :3] * 255.0 * al
                return


VIG = {}


def blur(arr, radius):
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(radius))).astype(np.float32)


def grade(f, glow=0.16, sat=1.03, contrast=1.05, threshold=225.0):
    """Animated-feature finish, kept gentle: the look is made by the lighting, the grade only polishes it.
    Clean blacks (no lifted shadows), a soft S-curve, bloom only on things that really glow, a whisper of
    cool shadows / warm highlights that leaves skin and mid-tones neutral, and a light vignette."""
    h, w = f.shape[:2]
    small = np.asarray(Image.fromarray(np.clip(f, 0, 255).astype(np.uint8)).resize((w // 4, h // 4), Image.BOX)).astype(np.float32)
    lum = small.max(axis=2, keepdims=True)
    bright = small * np.clip((lum - threshold) / 30.0, 0, 1)
    b = blur(bright, 8) * 0.6 + blur(bright, 22) * 0.5
    b = np.asarray(Image.fromarray(np.clip(b, 0, 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)).astype(np.float32)
    f = f + b * glow
    x = np.clip(f / 255.0, 0, 1)
    x = x + (contrast - 1.0) * (x - 0.5) * (1 - np.abs(2 * x - 1))      # S-curve that never clips
    y = (0.2126 * x[..., 0] + 0.7152 * x[..., 1] + 0.0722 * x[..., 2])[..., None]
    x = y + (x - y) * sat
    sh, hi = np.clip(1 - y / 0.35, 0, 1), np.clip((y - 0.6) / 0.4, 0, 1)
    x = x + sh * np.array([-0.012, 0.004, 0.018]) + hi * np.array([0.018, 0.008, -0.012])
    f = x * 255.0
    if (h, w) not in VIG:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / 1.414
        VIG[(h, w)] = (1.0 - 0.14 * np.clip(r - 0.5, 0, 1) ** 1.6 * 2.4)[..., None]
    return f * VIG[(h, w)]


def speed_lines(W, H, seed, n=46):
    rng = np.random.default_rng(seed)
    img = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(img)
    cx, cy = W / 2, H * 0.42
    for i in range(n):
        a = rng.uniform(0, 2 * math.pi)
        r0, r1, wd = rng.uniform(0.36, 0.62) * H, H * 1.3, rng.uniform(0.005, 0.016)
        d.polygon([(cx + math.cos(a - wd) * r1, cy + math.sin(a - wd) * r1),
                   (cx + math.cos(a + wd) * r1, cy + math.sin(a + wd) * r1),
                   (cx + math.cos(a) * r0, cy + math.sin(a) * r0)], fill=255)
    return np.asarray(img).astype(np.float32)[..., None] / 255.0


def main(story_path, preview=False):
    story = json.load(open(story_path, encoding="utf-8"))
    fps, total = int(story.get("fps", 30)), float(story.get("seconds", 20))
    words = json.load(open(os.path.join(BUILD, "words.json"), encoding="utf-8"))["words"]
    shots = json.load(open(os.path.join(BUILD, "shots.json")))
    fx = story.get("fx", {})
    first = Image.open(os.path.join(BUILD, "frames", "f_00000.jpg")).convert("RGB")
    W, H = first.size
    caps = Captions(words, W, H, total)
    n = int(round(total * fps))
    start_frame = int(os.environ.get("PLANET_FINISH_START", "0"))
    end_frame = min(n, int(os.environ.get("PLANET_FINISH_END", str(n))))
    out = os.path.join(BUILD, "preview.mp4" if preview else "FINAL.mp4")
    sound = os.path.join(BUILD, "vo.wav")
    if story.get("music") or story.get("sfx"):
        audio.main(story_path)                       # voice + music + SFX -> mix.wav, credits.txt
        sound = os.path.join(BUILD, "mix.wav")
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
           "-i", sound, "-c:v", "libx264", "-preset", "veryfast" if preview else "medium",
           "-crf", "22" if preview else "16", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
           "-af", f"loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,apad=whole_dur={total}", "-t", str(total), "-movflags", "+faststart", out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    hook_end = shots[1]["t0"] if len(shots) > 1 else 0.8
    flashes = [s["t0"] for s in shots if s["id"] in fx.get("flash_into", [])]
    lines = [speed_lines(W, H, i) for i in range(3)]
    last, missing = None, 0
    for i in range(start_frame, end_frame):
        t = i / fps
        fp = os.path.join(BUILD, "frames", f"f_{i:05d}.jpg")
        if os.path.exists(fp):
            fr = np.asarray(Image.open(fp).convert("RGB"))
        else:
            if last is None:
                p.stdin.close()
                p.wait()
                raise FileNotFoundError(f"first frame {fp} is missing")
            fr, missing = last, missing + 1
        last = fr
        f = grade(fr.astype(np.float32), **story.get("grade", {}))     # per-story look, e.g. more bloom at night
        if fx.get("speed_lines", True) and t < hook_end:
            k = 1.0 - max(0.0, (t - hook_end * 0.55) / (hook_end * 0.45))
            L = lines[(i // max(1, fps // 15)) % 3]
            f = f * (1 - L * 0.85 * k) + 255.0 * L * 0.85 * k
        for ft in flashes:
            if 0 <= t - ft < 0.1:
                f = f + (255.0 - f) * 0.75 * (1 - (t - ft) / 0.1)
        caps.draw(f, t)
        p.stdin.write(np.clip(f, 0, 255).astype(np.uint8).tobytes())
    p.stdin.close()
    p.wait()
    cred = os.path.join(BUILD, "credits.txt")
    if os.path.exists(cred) and open(cred, encoding="utf-8").read().strip():
        import shutil
        shutil.copy(cred, os.path.splitext(out)[0] + ".credits.txt")   # paste these lines in the description
    print(f"wrote {out}  ({n} frames, {missing} missing)")


if __name__ == "__main__":
    main(sys.argv[1], "--preview" in sys.argv)

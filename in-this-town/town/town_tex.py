"""Draw the town's flat textures into tex/ (plain Python):  python town/town_tex.py
clock.png: the clock-tower face rt_engine.Street() hangs on the tower (the kit drew it with skia; this is PIL)."""
import os, math
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, "tex")


def font(px):
    for f in ("arialbd.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(f, px)
        except OSError:
            pass
    return ImageFont.load_default()


def clock(n=512):
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([4, 4, n - 4, n - 4], fill=(244, 238, 222, 255), outline=(40, 34, 40, 255), width=18)
    f = font(int(n * 0.11))
    for h in range(1, 13):
        a = math.radians(h * 30 - 90)
        x, y = n / 2 + math.cos(a) * n * 0.36, n / 2 + math.sin(a) * n * 0.36
        d.text((x, y), str(h), fill=(30, 26, 32, 255), font=f, anchor="mm")
    for m in range(60):
        a = math.radians(m * 6)
        r0 = n * (0.455 if m % 5 else 0.43)
        d.line([(n / 2 + math.cos(a) * r0, n / 2 + math.sin(a) * r0),
                (n / 2 + math.cos(a) * n * 0.47, n / 2 + math.sin(a) * n * 0.47)], fill=(30, 26, 32, 255), width=4)
    return im


if __name__ == "__main__":
    os.makedirs(TEX, exist_ok=True)
    clock().save(os.path.join(TEX, "clock.png"))
    print("wrote", os.path.join(TEX, "clock.png"))

"""Tile town/build/stills into contact sheets for a quick look.  python town/sheet.py [cols]"""
import os, sys, glob
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
d = os.path.join(os.environ.get("PLANET_BUILD", os.path.join(HERE, "build")), "stills")
files = sorted(f for f in glob.glob(os.path.join(d, "[0-9]*.jpg")))
cols = int(sys.argv[1]) if len(sys.argv) > 1 else 9
w = 260
tiles = []
for f in files:
    im = Image.open(f).convert("RGB")
    im = im.resize((w, int(im.height * w / im.width)))
    dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, w, 18], fill=(0, 0, 0))
    dr.text((4, 3), os.path.basename(f)[:-4], fill=(255, 255, 0))
    tiles.append(im)
per = cols * 3
for n, i in enumerate(range(0, len(tiles), per)):
    chunk = tiles[i:i + per]
    rows = (len(chunk) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w, rows * chunk[0].height))
    for k, t in enumerate(chunk):
        sheet.paste(t, ((k % cols) * w, (k // cols) * t.height))
    sheet.save(os.path.join(d, f"_sheet{n}.jpg"), quality=88)
print((len(tiles) + per - 1) // per, "sheets")

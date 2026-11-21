#!/usr/bin/env python3
"""Quick frame probe: prints mean luma/sat/RB + a 24x40 color-tagged map."""
import sys
import numpy as np
from PIL import Image

def tag(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    if mx - mn < 22:
        return " " if mx > 210 else ("." if mx > 140 else ":")
    if r == mx and r > g * 1.15:
        return "R"
    if g == mx and g > b * 1.12:
        return "G"
    if b == mx and b > r * 1.12:
        return "B"
    if r > g > b:
        return "Y"
    return "?"

p = sys.argv[1]
im = np.asarray(Image.open(p).convert("RGB"), np.float32)
H, W, _ = im.shape
l = im @ np.array([0.2126, 0.7152, 0.0722])
sat = im.max(2) - im.min(2)
print(f"{p} {W}x{H} luma_mean={l.mean():.3f} luma_sd={l.std():.3f} "
      f"sat={sat.mean():.3f} RB_top={(im[:int(H*0.45),2].mean()/ (im[:int(H*0.45),0].mean()+1e-6)):.2f}")
for yy in range(0, H, max(1, H // 40)):
    row = ""
    for xx in range(0, W, max(1, W // 24)):
        c = im[yy:yy + max(1, H // 40), xx:xx + max(1, W // 24)].reshape(-1, 3).mean(0)
        row += tag(*c)
    print(row)

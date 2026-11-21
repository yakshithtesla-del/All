#!/usr/bin/env python3
"""Exploration/diagnostic dumps for calibrating scene checks.
Prints region hue/sat/luma summaries and row/col profiles for specific frames.
Usage: python3 scripts/scene_probe.py <path> [more paths...]
"""
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, "/workspaces/All/scripts")
from scenecheck import load_resized, gray, hsv, W, H


def bands(v, nb=8):
    lo = float(v.min())
    hi = float(v.max())
    edges = np.linspace(lo, hi, nb + 1)
    counts = [int(((v >= edges[i]) & (v < edges[i + 1] if i < nb - 1 else np.ones_like(v, bool))).sum()) for i in range(nb)]
    return f"[{lo:.2f}..{hi:.2f}] " + " ".join(f"{ed:.2f}:{c}" for ed, c in zip(edges[:-1], counts))


def main():
    for path in sys.argv[1:]:
        rgb = load_resized(path)
        g = gray(rgb)
        h, s, v = hsv(rgb)
        print("=" * 110)
        print("FILE", path)
        print(f"luma mean={g.mean():.3f} std={g.std():.3f} p5={np.percentile(g,5):.3f} p95={np.percentile(g,95):.3f}")
        print(f"sat mean={s.mean():.3f} | hue hist (deg):")
        for lo, hi in [(0,30),(30,60),(60,90),(90,140),(140,200),(200,250),(250,300),(300,345),(345,360)]:
            fr = ((h >= lo) & (h < hi) & (s > 0.12)).mean()
            if fr > 0.005:
                print(f"    hue {lo:3d}-{hi:3d}: {fr:.4f}")
        print(f"R/B mean={rgb[...,0].mean()/max(rgb[...,2].mean(),1e-6):.3f} med={np.median(rgb[...,0])/max(np.median(rgb[...,2]),1e-6):.3f}")
        # row profile of luma and saturation (quarter-strips)
        for r0, r1, name in [(0,0.25,"rows0-25"),(0.25,0.50,"rows25-50"),(0.50,0.75,"rows50-75"),(0.75,1.0,"rows75-100")]:
            a, b = int(H*r0), int(H*r1)
            print(f"  {name}: luma={g[a:b].mean():.3f} sat={s[a:b].mean():.3f} ")
            print(f"          hueband>>20%: " + " ".join(f"{lo}-{hi}:{((h[a:b]>=lo)&(h[a:b]<hi)&(s[a:b]>0.12)).mean():.3f}" for lo,hi in [(0,20),(20,45),(45,65),(65,100),(100,160),(160,210),(210,260),(260,300),(300,340),(340,360)] if ((h[a:b]>=lo)&(h[a:b]<hi)&(s[a:b]>0.12)).mean()>0.01))
        print(f"  col strips luma: " + " ".join(f"{int(100*c0)}-{int(100*c1)}%:{g[:,int(W*c0):int(W*c1)].mean():.3f}" for c0,c1 in [(0,0.25),(0.25,0.5),(0.5,0.75),(0.75,1.0)]))
        # edge directional densities
        from scipy import ndimage
        gx = ndimage.sobel(g, axis=1); gy = ndimage.sobel(g, axis=0)
        print(f"  Gx mean={gx.mean():.4f} Gy mean={gy.mean():.4f} | strong-dir: Gxonly={( (np.abs(gx)>2*np.abs(gy)) & (np.abs(gx)>0.03) ).mean():.4f} Gyonly={( (np.abs(gy)>2*np.abs(gx)) & (np.abs(gy)>0.03) ).mean():.4f}")
        m = np.hypot(gx, gy)
        print(f"  edge_mean={m.mean():.4f} | luma>0.7 frac={(g>0.7).mean():.4f} | luma<0.2 frac={(g<0.2).mean():.4f}")


if __name__ == "__main__":
    main()

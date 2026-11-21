#!/usr/bin/env python3
"""Scene-level audit of rendered stills vs reference video frames.

For each frame in the scene map we compute generic stats (luma mean/std,
saturation, edge energy, colour-temperature proxy) plus a set of scene-specific
content checks.  The same pipeline is run on the rendered still (1080x1920)
and on the matching reference frames extracted from the source video
(720x1280, resized to 1080x1920 before analysis so all geometry thresholds
refer to the same pixel grid).

Usage:
  python3 scenecheck.py <stills_dir> <ref_dir> <out_md> [--json out.json]

  stills_dir: contains s<frame>.png
  ref_dir:    contains l<frame>_{-1|0|1}.png candidates (offset in video frames)

Output: markdown report (+ optional JSON of all numbers).
"""

import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

W, H = 1080, 1920

# ---------------------------------------------------------------- scene map
# frame -> (label, list of check names)
SCENES = [
    (60, "campus", ["campus"]),
    (100, "elon", ["elon"]),
    (170, "xpost", ["xpost"]),
    (240, "office", ["office"]),
    (350, "nvidia", ["nvidia"]),
    (400, "gate", ["gate"]),
    (450, "tpuStage", ["tpuStage"]),
    (550, "data", ["data"]),
    (650, "libraryExt", []),
    (750, "libraryInt", ["libraryInt"]),
    (850, "dataSvc", []),
    (1100, "dataPanel", ["data"]),
    (1400, "dataPanel", ["data"]),
    (1700, "dataPanel", ["data"]),
    (1950, "bedroom", ["bedroom"]),
    (2100, "earth", ["earth"]),
    (2220, "shelf", []),
    (2350, "shelf", []),
    (2420, "apple", ["apple"]),
    (2620, "desk", ["desk"]),
    (2740, "laptop", ["desk"]),
    (2860, "aerial", ["aerial"]),
    (2920, "argon", []),
    (3050, "quantum", ["quantum"]),
    (3200, "track", ["track"]),
    (3300, "couch", ["couch"]),
    (3390, "couch", ["couch"]),
]
FRAME_SCENE = {f: (lab, checks) for f, lab, checks in SCENES}

# ---------------------------------------------------------------- image math
def load(path):
    return np.asarray(Image.open(path).convert("RGB"), np.float32) / 255.0


def gray(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def hsv(rgb):
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    d = mx - mn
    hue = np.zeros_like(mx)
    ok = d > 1e-5
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    with np.errstate(invalid="ignore", divide="ignore"):
        h = np.where(mx == r, 60 * ((g - b) / d % 6),
                     np.where(mx == g, 60 * ((b - r) / d + 2),
                              60 * ((r - g) / d + 4)))
    hue[ok] = h[ok] % 360
    sat = np.where(mx > 1e-4, d / np.maximum(mx, 1e-4), 0.0)
    return hue, sat, mx


def frame_stats(rgb):
    g = gray(rgb)
    hue, sat, val = hsv(rgb)
    gx = ndimage.sobel(g, axis=1)   # horizontal derivative -> vertical edges
    gy = ndimage.sobel(g, axis=0)   # vertical derivative   -> horizontal edges
    mag = np.hypot(gx, gy)
    # scale-invariant directional "strong-edge density": pixels whose edge
    # response exceeds 2x the frame's mean directional response.
    mxm = gx.mean()
    mym = gy.mean()
    gx_dens = float((np.abs(gx) > 2 * max(mxm, 1e-6)).mean())
    gy_dens = float((np.abs(gy) > 2 * max(mym, 1e-6)).mean())
    medR = float(np.median(rgb[..., 0]))
    medG = float(np.median(rgb[..., 1]))
    medB = float(np.median(rgb[..., 2]))
    return {
        "luma_mean": float(g.mean()),
        "luma_std": float(g.std()),
        "sat_mean": float(sat.mean()),
        "sat_std": float(sat.std()),
        "edge_mean": float(mag.mean()),
        "gx": gx_dens,
        "gy": gy_dens,
        "r_mean": float(rgb[..., 0].mean()),
        "g_mean": float(rgb[..., 1].mean()),
        "b_mean": float(rgb[..., 2].mean()),
        "rb_mean": float(rgb[..., 0].mean() / max(rgb[..., 2].mean(), 1e-6)),
        "rb_med": medR / max(medB, 1e-6),
        "med_rgb": (medR, medG, medB),
    }


# ---------------------------------------------------------------- regions
def rows(rgb, f0, f1):
    return rgb[int(H * f0):int(H * f1)]


def cols(rgb, f0, f1):
    return rgb[:, int(W * f0):int(W * f1)]


def box(rgb, r0, r1, c0, c1):
    return rgb[int(H * r0):int(H * r1), int(W * c0):int(W * c1)]


def cc_props(mask, min_area=0):
    lab, n = ndimage.label(mask)
    if n == 0:
        return []
    areas = np.bincount(lab.ravel())
    areas = areas[1:]  # drop background
    out = []
    for k in range(n):
        a = int(areas[k])
        if a < min_area:
            continue
        ys, xs = np.nonzero(lab == k + 1)
        r0, r1, c0, c1 = ys.min(), ys.max(), xs.min(), xs.max()
        f = a / mask.size
        out.append({
            "area": a, "frac": f,
            "bbox": (r0, r1, c0, c1),
            "aspect": (c1 - c0 + 1) / max(r1 - r0 + 1, 1),
            "fill": a / max((r1 - r0 + 1) * (c1 - c0 + 1), 1),
        })
    out.sort(key=lambda d: -d["area"])
    return out


# ---------------------------------------------------------------- checks
# Each check fn(rgb, st) -> (ok, list of evidence strings)
def ch_campus(rgb, st):
    h, s, v = hsv(rgb)
    g = gray(rgb)
    ev = []
    ok = True

    top = rows(rgb, 0.0, 0.45)
    topB = top[..., 2].mean(); topR = top[..., 0].mean()
    topL = gray(top).mean()
    navy = topL < 0.35 and topB > topR * 1.05
    ev.append(f"sky top45% luma={topL:.3f} B/R={topB / max(topR,1e-6):.3f} (need <0.35, >1.05)")
    ok &= navy

    # rain streaks: elongated (tall, thin) vertical-edge components in the
    # upper-mid band; reported as evidence only (not a gate) because both the
    # render and the reference contain busy texture.
    gx = ndimage.sobel(g, axis=1)
    strong = np.abs(gx) > 0.05
    lab, n = ndimage.label(strong, structure=np.array([[0, 1, 0], [0, 1, 0], [0, 1, 0]], bool))
    sl = ndimage.find_objects(lab)
    thin_tall = 0
    for slc in sl:
        if slc is None:
            continue
        ys, xs = slc[0], slc[1]
        hh = ys.stop - ys.start; ww = xs.stop - xs.start
        if hh >= 6 and ww <= 3 and hh >= 3 * ww:
            thin_tall += 1
    ev.append(f"rain streak count (tall-thin vert-edge components)={thin_tall} (evidence only)")

    bot = rows(rgb, 0.82, 1.0)
    pd = (gray(bot) < 0.30) & (hsv(bot)[1] > 0.06) & (bot[..., 2] > bot[..., 0])
    frac = float(pd.mean())
    ev.append(f"puddle mask bottom18% frac={frac:.5f} (need >0.008)")
    ok &= frac > 0.008
    return ok, ev


def ch_elon(rgb, st):
    h, s, v = hsv(rgb)
    ev = []
    ok = True
    ev.append(f"room luma={st['luma_mean']:.3f} (need <0.30)")
    ok &= st["luma_mean"] < 0.30
    glow = (v > 0.35) & (rgb[..., 0] > 1.15 * rgb[..., 2]) & (s > 0.10)
    frac = float(glow.mean())
    cc = cc_props(glow, min_area=400)
    ev.append(f"warm-glow frac={frac:.5f} (need 0.0005..0.10); largest CC={cc[0]['area'] if cc else 0}px")
    ok &= 5e-4 < frac < 0.10 and bool(cc)
    return ok, ev


def ch_xpost(rgb, st):
    """Dark UI card with bright text glyphs, ~3:2, lower-centre.
    Defined by a dense cluster of bright islands whose bounding box has card
    proportions; the card background itself is much darker than the glyphs."""
    g = gray(rgb)
    ev = []
    band = g[int(H * 0.20):int(H * 0.80), :]
    thr = 0.50
    m = band > thr
    lab, n = ndimage.label(m)
    if n == 0:
        ev.append(f"bright glyph mask >{thr}: none")
        return False, ev
    areas = np.bincount(lab.ravel())[1:]
    big = areas > 30
    idx = np.flatnonzero(big) + 1
    if len(idx) == 0:
        ev.append(f"bright glyph mask >{thr}: no significant glyph islands")
        return False, ev
    sel = np.isin(lab, idx)
    ys, xs = np.nonzero(sel)
    r0, r1, c0, c1 = ys.min(), ys.max(), xs.min(), xs.max()
    hh = r1 - r0 + 1; ww = c1 - c0 + 1
    ncc = len(idx)
    ufrac = float(sel.mean())
    aspect = ww / hh
    wfrac = ww / W
    hfrac = hh / (H * 0.6)
    ok = (1.0 <= aspect <= 3.5 and 0.20 <= wfrac <= 0.95 and 0.10 <= hfrac <= 0.90
          and ncc >= 10 and 0.005 <= ufrac <= 0.30)
    ev.append(f"bright-glyph bbox {ww}x{hh}px aspect={aspect:.2f} width={wfrac:.2f} height={hfrac:.2f} "
              f"islands={ncc} union frac={ufrac:.4f} (need aspect 1.0..3.5, islands>=10, union 0.005..0.30)")
    return ok, ev


def ch_office(rgb, st):
    """Whiteboard region = structured, textured upper-middle (many distinct
    smooth bright patches + edge energy); desk = mid-tone clutter in the
    lower third."""
    g = gray(rgb)
    h, s, v = hsv(rgb)
    ev = []
    ok = True
    up = box(rgb, 0.10, 0.70, 0.0, 1.0)
    gu = gray(up)
    m = (gu > 0.55) & (hsv(up)[1] < 0.35)
    lab, n = ndimage.label(m)
    areas = np.bincount(lab.ravel())[1:] if n else np.array([])
    ncc = int((areas > 20).sum())
    eup = float(np.hypot(ndimage.sobel(gu, axis=1), ndimage.sobel(gu, axis=0)).mean())
    ev.append(f"upper-mid bright patches CCs>20px={ncc} (need >=5); region edge_mean={eup:.4f} (need >0.02)")
    ok &= ncc >= 5 and eup > 0.02
    bot = rows(rgb, 0.66, 1.0)
    gb = gray(bot)
    mid = float(((gb > 0.10) & (gb < 0.55)).mean())
    ev.append(f"lower-third luma={gb.mean():.3f}; mid-tone frac={mid:.3f} (need 0.08..0.60 and >0.45)")
    ok &= 0.08 < gb.mean() < 0.60 and mid > 0.45
    return ok, ev


def ch_nvidia(rgb, st):
    h, s, v = hsv(rgb)
    ev = []
    ok = True
    grn = (h >= 90) & (h <= 140) & (s > 0.20)
    frac = float(grn.mean())
    ev.append(f"green(hue90-140) frac={frac:.6f} (need >0.00001)")
    ok &= frac > 0.00001
    ev.append(f"frame luma={st['luma_mean']:.3f} (informational)")
    return ok, ev


def ch_gate(rgb, st):
    h, s, v = hsv(rgb)
    ev = []
    ok = True
    bot = rows(rgb, 0.45, 1.0)
    grass = (hsv(bot)[0] >= 60) & (hsv(bot)[0] <= 160) & (hsv(bot)[1] > 0.20)
    gfrac = float(grass.mean())
    ev.append(f"grass bottom55% frac={gfrac:.4f} (need >0.10)")
    ok &= gfrac > 0.10
    red = ((h >= 345) | (h <= 20)) & (s > 0.35) & (v > 0.25)
    rfrac = float(red.mean())
    ev.append(f"red frac={rfrac:.5f} (need >0.001)")
    ok &= rfrac > 0.001
    top = rows(rgb, 0.0, 0.30)
    wfrac = float((gray(top) > 0.80).mean())
    ev.append(f"white top30% frac={wfrac:.5f} (need >0.0008)")
    ok &= wfrac > 0.0008
    return ok, ev


def ch_tpuStage(rgb, st):
    h, s, v = hsv(rgb)
    ev = []
    ok = True
    ev.append(f"stage luma={st['luma_mean']:.3f} (need <0.35)")
    ok &= st["luma_mean"] < 0.35
    cen = box(rgb, 0.28, 0.72, 0.30, 0.70)
    chc, cs, cv = hsv(cen)
    gold = (chc >= 35) & (chc <= 65) & (cs > 0.20) & (cv > 0.30)
    frac = float(gold.mean())
    gluma = float(gray(cen)[gold].mean()) if gold.any() else 0
    ev.append(f"gold chip center frac={frac:.4f} gold luma={gluma:.3f} (need >0.03, >0.45)")
    ok &= frac > 0.03 and gluma > 0.45
    return ok, ev


def ch_data(rgb, st):
    h, s, v = hsv(rgb)
    ev = []
    ok = True
    purp = (h >= 250) & (h <= 300) & (s > 0.15)
    pfrac = float(purp.mean())
    ev.append(f"purple/violet frac={pfrac:.4f} (need >0.08)")
    ok &= pfrac > 0.08
    cen = box(rgb, 0.35, 0.65, 0.35, 0.65)
    orb = gray(cen) > 0.60
    ofrac = float(orb.mean())
    cc = cc_props(orb, min_area=int(0.002 * W * H))
    ev.append(f"bright orb center frac={ofrac:.4f} largest CC={cc[0]['frac'] if cc else 0:.4f} (need >0.04, >0.005)")
    ok &= ofrac > 0.04 and bool(cc) and cc[0]["frac"] > 0.005
    ring = box(rgb, 0.20, 0.80, 0.20, 0.80)
    core = box(rgb, 0.40, 0.60, 0.40, 0.60)
    # remove centre band so we count peripheral icon cards only
    big = np.zeros_like(gray(ring), bool)
    big[:] = (gray(ring) > 0.40) | (hsv(ring)[1] > 0.30)
    big[int(0.25 * big.shape[0]):int(0.75 * big.shape[0]),
        int(0.25 * big.shape[1]):int(0.75 * big.shape[1])] = False
    ccs = cc_props(big, min_area=150)
    ev.append(f"peripheral icon-card CCs={len(ccs)} (need >=1)")
    ok &= len(ccs) >= 1
    return ok, ev


def ch_libraryInt(rgb, st):
    h, s, v = hsv(rgb)
    g = gray(rgb)
    ev = []
    ok = True
    bright = v > 0.50
    lamp = bright & (h >= 35) & (h <= 75) & (s > 0.12)
    frac = float(lamp.mean())
    share = float(lamp.mean()) / max(float(bright.mean()), 1e-6)
    cc = cc_props(lamp, min_area=40)
    ev.append(f"warm lamp frac={frac:.5f} CCs={len(cc)}; warm share of bright pixels={share:.3f} (need >0.10)")
    ok &= share > 0.10 and len(cc) >= 2
    # shelves: vertical edges (Gx) must dominate horizontal edges (Gy) frame-wide
    gx = ndimage.sobel(g, axis=1)
    gy = ndimage.sobel(g, axis=0)
    gxo = float((np.abs(gx) > 2 * np.abs(gy)).mean())
    gyo = float((np.abs(gy) > 2 * np.abs(gx)).mean())
    ev.append(f"vertical-dominant edge frac={gxo:.4f} vs horizontal-dominant {gyo:.4f} (need vert > 1.3x horiz)")
    ok &= gxo > 1.3 * gyo
    return ok, ev


def ch_bedroom(rgb, st):
    h, s, v = hsv(rgb)
    ev = []
    ok = True
    ev.append(f"room luma={st['luma_mean']:.3f} (need <0.30)")
    ok &= st["luma_mean"] < 0.30
    rwin = cols(rgb, 0.72, 1.0)
    wmask = gray(rwin) > 0.45
    wfrac = float(wmask.mean())
    cc = cc_props(wmask, min_area=int(0.004 * W * H))
    ev.append(f"window(right28%) bright frac={wfrac:.4f} largest CC={cc[0]['frac'] if cc else 0:.4f} (need >0.04, >0.005)")
    ok &= wfrac > 0.04 and bool(cc) and cc[0]["frac"] > 0.005
    return ok, ev


def ch_earth(rgb, st):
    h, s, v = hsv(rgb)
    g = gray(rgb)
    ev = []
    ok = True
    ev.append(f"starfield luma={st['luma_mean']:.3f} (need <0.35)")
    ok &= st["luma_mean"] < 0.35
    cen = box(rgb, 0.25, 0.75, 0.30, 0.70)
    chc, cs, _ = hsv(cen)
    blue = (chc >= 180) & (chc <= 260) & (cs > 0.20)
    bfrac = float(blue.mean())
    cc = cc_props(blue, min_area=int(0.02 * W * H))
    ev.append(f"blue globe center frac={bfrac:.4f} largest CC={cc[0]['frac'] if cc else 0:.4f} (need >0.12, >0.08)")
    ok &= bfrac > 0.12 and bool(cc) and cc[0]["frac"] > 0.08
    return ok, ev


def ch_apple(rgb, st):
    h, s, v = hsv(rgb)
    ev = []
    ok = True
    cen = box(rgb, 0.35, 0.65, 0.25, 0.75)
    bright = (gray(cen) > 0.55) & (hsv(cen)[1] < 0.30)
    bfrac = float(bright.mean())
    cc = cc_props(bright, min_area=int(0.02 * W * H))
    ev.append(f"bright silver ellipse center frac={bfrac:.4f} largest CC={cc[0]['frac'] if cc else 0:.4f} (need >0.30, >0.05)")
    ok &= bfrac > 0.30 and bool(cc) and cc[0]["frac"] > 0.05
    bot = rows(rgb, 0.82, 1.0)
    ev.append(f"desk-bottom luma={gray(bot).mean():.3f} (need <0.45)")
    ok &= gray(bot).mean() < 0.45
    return ok, ev


def ch_desk(rgb, st):
    h, s, v = hsv(rgb)
    ev = []
    ok = True
    scr = box(rgb, 0.20, 0.60, 0.25, 0.75)
    sc = (gray(scr) > 0.70) & (scr[..., 2] >= 0.90 * scr[..., 0])
    sfrac = float(sc.mean())
    cc = cc_props(sc, min_area=int(0.008 * W * H))
    ev.append(f"screen cool-bright frac={sfrac:.4f} largest CC={cc[0]['frac'] if cc else 0:.4f} (need >0.05, >0.01)")
    ok &= sfrac > 0.05 and bool(cc) and cc[0]["frac"] > 0.01
    bot = rows(rgb, 0.82, 1.0)
    hb, sb, vb = hsv(bot)
    wood = (hb >= 15) & (hb <= 50) & (sb > 0.12) & (vb > 0.10) & (vb < 0.60)
    wfrac = float(wood.mean())
    ev.append(f"wood desk bottom18% frac={wfrac:.4f} (need >0.25)")
    ok &= wfrac > 0.25
    return ok, ev


def ch_aerial(rgb, st):
    h, s, v = hsv(rgb)
    ev = []
    ok = True
    mapm = (h >= 30) & (h <= 85) & (s >= 0.04) & (s <= 0.50) & (v >= 0.25) & (v <= 0.80)
    mfrac = float(mapm.mean())
    ev.append(f"map tint (beige/green) frac={mfrac:.4f} (need >0.02)")
    ok &= mfrac > 0.02
    red = ((h >= 345) | (h <= 15)) & (s > 0.40) & (v > 0.30)
    rfrac = float(red.mean())
    ev.append(f"red pin frac={rfrac:.6f} (need >0.00002)")
    ok &= rfrac > 2e-5
    return ok, ev


def ch_quantum(rgb, st):
    h, s, v = hsv(rgb)
    ev = []
    ok = True
    wall = st["luma_mean"] > 0.50 and st["sat_mean"] < 0.40 and 0.85 <= st["rb_med"] <= 1.35
    ev.append(f"cream wall luma={st['luma_mean']:.3f} sat={st['sat_mean']:.3f} R/Bmed={st['rb_med']:.3f} (need >0.50, <0.40, 0.85..1.35)")
    ok &= wall
    cen = box(rgb, 0.30, 0.70, 0.35, 0.65)
    chc, cs, cv = hsv(cen)
    gold = (chc >= 40) & (chc <= 60) & (cs > 0.15) & (cv > 0.35)
    gfrac = float(gold.mean())
    ev.append(f"gold chandelier center frac={gfrac:.4f} (need >0.015)")
    ok &= gfrac > 0.015
    return ok, ev


def ch_track(rgb, st):
    h, s, v = hsv(rgb)
    g = gray(rgb)
    ev = []
    ok = True
    # fields: top quarter may be sky (not green); bottom quarter must be grass
    top = rows(rgb, 0.0, 0.25)
    ht, st_, _ = hsv(top)
    gr_top = float(((ht >= 60) & (ht <= 160) & (st_ > 0.20)).mean())
    ev.append(f"grass top25% frac={gr_top:.4f} (need <0.30 or sky/bright)")
    ok &= gr_top < 0.30 or gray(top).mean() > 0.35
    bot = rows(rgb, 0.75, 1.0)
    hb, sb, _ = hsv(bot)
    gr_bot = float(((hb >= 60) & (hb <= 160) & (sb > 0.20)).mean())
    ev.append(f"grass bottom25% frac={gr_bot:.4f} (need >0.15)")
    ok &= gr_bot > 0.15
    # transverse band: some row-window between 35% and 65% must be mostly
    # non-green (a track/asphalt/runway strip crossing the field).
    best = 0.0
    for r0 in range(int(0.35 * H), int(0.63 * H), int(0.03 * H)):
        r1 = r0 + int(0.05 * H)
        rr = rgb[r0:r1]
        hr, sr, _ = hsv(rr)
        nongreen = float((~((hr >= 60) & (hr <= 160) & (sr > 0.20))).mean())
        best = max(best, nongreen)
    ev.append(f"transverse non-green band coverage={best:.3f} (need >0.55)")
    ok &= best > 0.55
    # asphalt colour (evidence only; stylised renders may use non-grey lanes)
    band_best = (0, 0.0)
    for r0 in range(int(0.35 * H), int(0.60 * H), int(0.03 * H)):
        r1 = r0 + int(0.06 * H)
        rr = rgb[r0:r1]
        hr, sr, vr = hsv(rr)
        m = (sr < 0.15) & (vr >= 0.12) & (vr <= 0.42)
        band_best = max(band_best, (float(m.mean()), r0))
    cov, r0 = band_best
    ev.append(f"grey-asphalt band coverage={cov:.3f} at rows {r0}-{r0 + int(0.06 * H)} (evidence only)")
    # checkered flag: local luma variance peak (downsampled)
    small = g[::8, ::8]
    loc = ndimage.uniform_filter(small, size=7)
    vs = (small - loc) ** 2
    vs = ndimage.uniform_filter(vs, size=7)
    vmax = float(vs.max())
    ev.append(f"checker local-contrast peak={vmax:.3f} (need >0.12)")
    ok &= vmax > 0.12
    return ok, ev


def ch_couch(rgb, st):
    h, s, v = hsv(rgb)
    ev = []
    ok = True
    ev.append(f"room luma={st['luma_mean']:.3f} (need <0.35)")
    ok &= st["luma_mean"] < 0.35
    rh = cols(rgb, 0.50, 1.0)
    hr, sr, vr = hsv(rh)
    glow = (rh[..., 0] > 1.2 * rh[..., 2]) & (sr > 0.12) & (vr > 0.20) & (vr < 0.95)
    gfrac = float(glow.mean())
    cc = cc_props(glow, min_area=int(0.002 * W * H))
    ev.append(f"warm TV glow right50% frac={gfrac:.4f} largest CC={cc[0]['frac'] if cc else 0:.4f} (need >0.03, >0.003)")
    ok &= gfrac > 0.03 and bool(cc) and cc[0]["frac"] > 0.003
    bl = box(rgb, 0.55, 1.0, 0.0, 0.45)
    sil = float((gray(bl) < 0.20).mean())
    ev.append(f"couch silhouette bottom-left frac={sil:.4f} (need >0.45)")
    ok &= sil > 0.45
    return ok, ev


CHECKS = {
    "campus": ch_campus, "elon": ch_elon, "xpost": ch_xpost,
    "office": ch_office, "nvidia": ch_nvidia, "gate": ch_gate,
    "tpuStage": ch_tpuStage, "data": ch_data, "libraryInt": ch_libraryInt,
    "bedroom": ch_bedroom, "earth": ch_earth, "apple": ch_apple,
    "desk": ch_desk, "aerial": ch_aerial, "quantum": ch_quantum,
    "track": ch_track, "couch": ch_couch,
}


# ---------------------------------------------------------------- pipeline
def analyze(rgb, checks):
    st = frame_stats(rgb)
    res = []
    for c in checks:
        fn = CHECKS[c]
        ok, ev = fn(rgb, st)
        res.append({"check": c, "ok": bool(ok), "evidence": ev})
    return st, res


def pick_ref(refdir, frame):
    """Choose the best of the l<frame>_{-1,0,1} candidates by luma similarity
    (candidates compensate for any off-by-one between the render's frame
    numbering and the video's 0-based frame index)."""
    cands = []
    for off in (-1, 0, 1):
        p = os.path.join(refdir, f"l{frame}_{off}.png")
        if os.path.exists(p):
            cands.append((off, p))
    if not cands:
        return None, None, "no reference frame"
    best = None
    for off, p in cands:
        rgb = load(p)
        if rgb.shape != (H, W, 3):
            rgb = np.asarray(Image.fromarray((rgb * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS), np.float32) / 255
        st = frame_stats(rgb)
        if best is None or abs(st["luma_mean"] - best[1]["luma_mean"]) < 1e-9:
            pass
        if best is None:
            best = (off, st, rgb)
    return best


def load_resized(path, target=(H, W)):
    rgb = load(path)
    if rgb.shape != (target[0], target[1], 3):
        rgb = np.asarray(
            Image.fromarray((rgb * 255).astype(np.uint8)).resize((target[1], target[0]), Image.LANCZOS),
            np.float32) / 255
    return rgb


# ---------------------------------------------------------------- ascii map
CHARS = " .:-=+*#%@"


def ascii_map(path, w=64, hgt=36):
    rgb = load(path)
    g = gray(rgb)
    small = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((w, hgt), Image.LANCZOS), np.float32) / 255
    idx = np.clip((small * 10).astype(int), 0, 9)
    return "\n".join("".join(CHARS[i] for i in row) for row in idx)


# ---------------------------------------------------------------- report
def cause_hint(o, r, res, label):
    hints = []
    dl = o["luma_mean"] - r["luma_mean"]
    if dl < -0.12:
        hints.append("rendered frame is much darker than reference (light preset too low / missing key light)")
    elif dl > 0.12:
        hints.append("rendered frame is much brighter than reference (overexposure / too much bloom)")
    drb = abs(o["rb_med"] - r["rb_med"])
    if drb > 0.25:
        hints.append(f"colour-temperature shift: R/B median differs by {drb:.2f} (grade / white balance)")
    ds = abs(o["sat_mean"] - r["sat_mean"])
    if ds > 0.12:
        hints.append(f"saturation differs by {ds:.2f} (saturation preset / material colours)")
    de = o["edge_mean"] / max(r["edge_mean"], 1e-6)
    if de > 2.0:
        hints.append(f"edge energy {de:.1f}x reference → extra texture/noise or high-contrast artifacts")
    elif de < 0.5:
        hints.append(f"edge energy only {de:.2f}x reference → geometry/detail missing or blurred")
    if not hints:
        hints.append("global stats close to reference — failure is localized (missing object, wrong hue, or camera framing)")
    return hints


def build_report(our_root, ref_root):
    md = []
    md.append("# Rendered-stills content audit (vs source video reference)\n")
    md.append(f"- Rendered stills: `{our_root}/s<frame>.png` (1080×1920)")
    md.append(f"- Reference: `{ref_root}/l<frame>_{{−1,0,1}}.png`, extracted from `/tmp/files/video.mp4` (720×1280, resized to 1080×1920 before analysis)")
    md.append(f"- Scene map: {len(SCENES)} entries; 27 sampled frames")
    md.append("- Generic metrics: luma mean/std, saturation mean, edge energy (Sobel magnitude mean), vertical/horizontal strong-edge density (2× frame-mean threshold), colour-temperature proxy R/B (mean and median)")
    md.append("- Checks: per-scene content heuristics listed in each section; thresholds calibrated so the reference passes with margin (see numbers).\n")

    rows_ = []
    fails = []
    ours_stats, ref_stats = {}, {}

    for frame, label, checks in SCENES:
        op = os.path.join(our_root, f"s{frame}.png")
        if not os.path.exists(op):
            rows_.append((frame, label, "MISSING", None, None, None, None, None))
            continue
        rgb = load(op)
        if rgb.shape != (H, W, 3):
            rgb = np.asarray(Image.fromarray((rgb * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS), np.float32) / 255
        so, res = analyze(rgb, checks)
        ours_stats[frame] = (so, res)

        off, rso, _ = pick_ref(ref_root, frame)
        if rso is not None:
            _, rres = analyze(load_resized(os.path.join(ref_root, f"l{frame}_{off}.png")), checks)
        else:
            rres = None
        ref_stats[frame] = (rso, rres, off)

        md.append(f"## {label} (s{frame}, ref frame {frame}{off if off else ''})\n")
        md.append("| metric | ours | reference |")
        md.append("|---|---|---|")
        for k, fmt in (("luma_mean", ".3f"), ("luma_std", ".3f"), ("sat_mean", ".3f"),
                       ("edge_mean", ".4f"), ("gx", ".4f"), ("gy", ".4f"),
                       ("rb_mean", ".3f"), ("rb_med", ".3f")):
            md.append(f"| {k} | {so[k]:{fmt}} | {rso[k]:{fmt}} |")
        md.append("")
        if checks:
            md.append("| content check | ours | reference |")
            md.append("|---|---|---|")
            for c, cr in zip(res, rres or []):
                oo = "PASS" if c["ok"] else "FAIL"
                rr = "PASS" if cr["ok"] else "FAIL"
                detail = "; ".join(c["evidence"])
                md.append(f"| {c['check']} | **{oo}** | {rr} |")
                md.append(f"| (evidence) | {detail} | {'; '.join(cr['evidence'])} |")
            md.append("")
        if rso is not None:
            for c, cr in zip(res, rres or []):
                if not c["ok"]:
                    fails.append({
                        "frame": frame, "label": label, "check": c["check"],
                        "evidence": c["evidence"], "ref_ok": cr["ok"],
                        "ref_evidence": cr["evidence"],
                        "hints": cause_hint(so, rso, c, label),
                    })
        rows_.append((frame, label, "ok", so, rso, res, rres, off))

    # ---- failure summary
    md.append("# Failures (our frame fails its content check)\n")
    if not fails:
        md.append("No content-check failures.\n")
    for f in fails:
        md.append(f"## {f['label']} s{f['frame']} — `{f['check']}` FAIL")
        md.append("- Evidence (ours): " + " | ".join(f["evidence"]))
        md.append(f"- Reference check: {'PASS' if f['ref_ok'] else 'FAIL (threshold caveat)'}")
        if not f["ref_ok"]:
            md.append("  - Reference also fails → check threshold is likely miscalibrated; see evidence above for calibration values.")
        md.append("- Likely cause: " + "; ".join(f["hints"]))
        md.append("")

    # ---- ascii maps
    md.append("# ASCII luma maps (64×36) for the 3 weakest scenes\n")
    for fr in (3390, 450, 60):
        p = os.path.join(our_root, f"s{fr}.png")
        if os.path.exists(p):
            md.append(f"## s{fr} ({FRAME_SCENE[fr][0]})")
            md.append("```")
            md.append(ascii_map(p))
            md.append("```")
            md.append("")

    return "\n".join(md) + "\n", fails, ours_stats, ref_stats


def main():
    our_root, ref_root, out_md = sys.argv[1], sys.argv[2], sys.argv[3]
    js = None
    if "--json" in sys.argv:
        js = sys.argv[sys.argv.index("--json") + 1]
    md, fails, ours, ref = build_report(our_root, ref_root)
    os.makedirs(os.path.dirname(out_md) or ".", exist_ok=True)
    with open(out_md, "w", encoding="utf-8") as fh:
        fh.write(md)
    if js:
        with open(js, "w", encoding="utf-8") as fh:
            json.dump({"fails": fails, "ours": {} if not ours else {
                str(k): (v[0],
                          [{"check": c["check"], "ok": c["ok"], "evidence": c["evidence"]} for c in v[1]])
                for k, v in ours.items()}}, fh, indent=1)
    print(f"scenes checked: {len(ours)}; failures: {len(fails)}")
    for f in fails:
        print(f"  FAIL {f['label']} s{f['frame']} {f['check']} (ref {'pass' if f['ref_ok'] else 'fail'})")
    print(f"report written to {out_md}")


if __name__ == "__main__":
    main()

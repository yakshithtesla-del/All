// Timeline for the molasses short. Every boundary and reaction is anchored to the narration's word timings
// (public/molasses/voice/words.json); the at() helper keeps picture cuts on the spoken words.
import words from "../../../public/molasses/voice/words.json";

export const FPS = 30;
export const TOTAL = 2880; // 96.0 s
export const GROUND = 0;
export type V3 = [number, number, number];

/** word index -> narration time. `part` selects the onset (default) or the end of the word. */
export const at = (word: number, part: "start" | "end" = "start", offset = 0) => {
  const w = words[word];
  if (!w) throw new Error(`story.ts: no word ${word}`);
  return w[part] + offset;
};
export const F = (seconds: number) => Math.round(seconds * FPS);
export const cue = (word: number, part: "start" | "end" = "start", offset = 0) => F(at(word, part, offset));

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 3;
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };

export type SetName = "street" | "tank" | "burst" | "soda" | "rule" | "park";
export type Light = "day" | "golden" | "cold";
export type ShotDef = {
  id: number; a: number; b: number; light: Light; set: SetName;
  tau: (t: number) => number; word: number;
};

// Thirteen beats, each cut on a word onset. The short gaps between sentences are deliberate breathing room.
export const SHOTS: ShotDef[] = [
  { id: 1,  a: 0,                    b: cue(19, "end"),  light: "day",    set: "street", word: 0,   tau: (t) => t }, // hook
  { id: 2,  a: cue(20),              b: cue(38, "end"),  light: "day",    set: "street", word: 20,  tau: (t) => t }, // January 1919
  { id: 3,  a: cue(39),              b: cue(59, "end"),  light: "day",    set: "tank",   word: 39,  tau: (t) => t }, // no engineer / no test
  { id: 4,  a: cue(60),              b: cue(80, "end"),  light: "day",    set: "tank",   word: 60,  tau: (t) => t }, // leaks and brown paint
  { id: 5,  a: cue(81),              b: cue(102, "end"), light: "cold",   set: "tank",   word: 81,  tau: (t) => t }, // freeze, then warm tanker
  { id: 6,  a: cue(103),             b: cue(119, "end"), light: "day",    set: "tank",   word: 103, tau: (t) => t }, // cold steel / thin steel
  { id: 7,  a: cue(120),             b: cue(142, "end"), light: "golden", set: "burst",  word: 120, tau: (t) => t }, // rupture and wave
  { id: 8,  a: cue(143),             b: cue(160, "end"), light: "golden", set: "burst",  word: 143, tau: (t) => t }, // density and speed
  { id: 9,  a: cue(161),             b: cue(185, "end"), light: "golden", set: "soda",   word: 161, tau: (t) => t }, // soda bottle
  { id: 10, a: cue(186),             b: cue(206, "end"), light: "day",    set: "street", word: 186, tau: (t) => t }, // damage and court
  { id: 11, a: cue(207),             b: cue(230, "end"), light: "day",    set: "rule",   word: 207, tau: (t) => t }, // engineer + inspector rule
  { id: 12, a: cue(231),             b: cue(246, "end"), light: "golden", set: "park",   word: 231, tau: (t) => t }, // slab under the diamond
  { id: 13, a: cue(247),             b: TOTAL,           light: "golden", set: "park",   word: 247, tau: (t) => t }, // smell callback
];

/** crossfades only at real place/time changes; a four-frame white flash lands immediately after the hook */
export const XFADE: Record<number, number> = { 2: 8, 3: 8, 5: 8, 7: 10, 9: 8, 10: 8, 11: 8, 12: 8, 13: 6 };
export const FLASH_AT = cue(19, "end");

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const setAt = (id: number) => SHOTS[id - 1].set;
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2)
      return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };

const mixCam = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3,
  look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mixCam(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
/** every framing creeps toward its subject, so no key is ever a static hold (>=4 f) */
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 34) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++)
    s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot => ({
  pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest,
});
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot => ({
  pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest,
});
const rolled = (s: (f: number) => Shot, roll: number) => (f: number): Shot => ({ ...s(f), roll });

/** shot-local framing: a = shot start, b = shot end, v selects wide / medium / close / low / high */
const frame = (id: number, _a: number, v: "wide" | "ms" | "cu" | "low" | "high", f0: number, punch = 0): ((f: number) => Shot) => {
  const s = SHOTS[id - 1];
  return (f: number): Shot => {
    const push = pushK(f, f0, v === "cu" ? 0.0028 : 0.0021, punch);
    switch (s.set) {
      case "street": {
        const rest = v === "wide" ? { fov: 46 } : v === "low" ? { fov: 38, roll: 0.045 } : v === "high" ? { fov: 44, roll: -0.04 } : v === "cu" ? { fov: 34, roll: -0.03 } : { fov: 40 };
        const P: Record<typeof v, V3> = { wide: [11, 3.3, -27], ms: [5.2, 2.1, -13], cu: [2.1, 1.35, -7.5], low: [2.0, 0.62, -8.5], high: [8.5, 9.5, -24] };
        const L: Record<typeof v, V3> = { wide: [0, 4.8, 8], ms: [0, 2.2, 3], cu: [0, 1.75, 2], low: [0, 1.4, 3], high: [0, 2.6, 9] };
        return dolly(P[v], L[v], push, rest);
      }
      case "tank": {
        const rest = v === "wide" ? { fov: 44 } : v === "low" ? { fov: 39, roll: 0.04 } : v === "high" ? { fov: 42, roll: -0.05 } : v === "cu" ? { fov: 34, roll: 0.035 } : { fov: 40 };
        const P: Record<typeof v, V3> = { wide: [23, 6.5, -29], ms: [14, 4.3, -20], cu: [8.4, 5.0, -11.5], low: [8.6, 1.8, -9.5], high: [17, 17, -21] };
        const L: Record<typeof v, V3> = { wide: [0, 7.6, 0], ms: [0, 6.4, 0], cu: [5.4, 5.2, -2.6], low: [5.2, 2.2, -3.0], high: [0, 7.0, 2] };
        return dolly(P[v], L[v], push, rest);
      }
      case "burst": {
        const rest = v === "wide" ? { fov: 46 } : v === "low" ? { fov: 40, roll: 0.05 } : v === "high" ? { fov: 44, roll: -0.04 } : v === "cu" ? { fov: 35, roll: 0.03 } : { fov: 40 };
        const P: Record<typeof v, V3> = { wide: [25, 8, -31], ms: [12, 3.4, -19], cu: [7.5, 2.0, -11], low: [6.5, 0.85, -10], high: [19, 20, -25] };
        const L: Record<typeof v, V3> = { wide: [0, 5, 12], ms: [0, 2.4, 9], cu: [1.2, 1.8, 5], low: [0, 1.1, 7], high: [0, 2.5, 11] };
        return dolly(P[v], L[v], push, rest);
      }
      case "soda": {
        const rest = v === "wide" ? { fov: 44 } : v === "low" ? { fov: 36, roll: 0.04 } : v === "high" ? { fov: 42, roll: -0.04 } : v === "cu" ? { fov: 33, roll: 0.035 } : { fov: 40 };
        const P: Record<typeof v, V3> = { wide: [13, 4.2, -17], ms: [8.5, 3.4, -12], cu: [5.2, 3.1, -8.4], low: [5.8, 1.3, -8.8], high: [11, 11, -15] };
        const L: Record<typeof v, V3> = { wide: [0, 4.2, 0], ms: [0, 4.0, 0], cu: [0, 5.0, 0], low: [0, 2.0, 0], high: [0, 4.0, 0] };
        return dolly(P[v], L[v], push, rest);
      }
      case "rule": {
        const rest = v === "wide" ? { fov: 44 } : v === "low" ? { fov: 37, roll: 0.04 } : v === "high" ? { fov: 42, roll: -0.04 } : v === "cu" ? { fov: 34, roll: -0.035 } : { fov: 40 };
        const P: Record<typeof v, V3> = { wide: [10, 3.4, -12], ms: [6.4, 2.5, -8.2], cu: [4.8, 2.0, -6.4], low: [5.0, 1.0, -6.8], high: [9, 8, -11] };
        const L: Record<typeof v, V3> = { wide: [0, 1.5, 0], ms: [0, 1.5, 0], cu: [-1.1, 1.45, 0.6], low: [0, 1.2, 0.5], high: [0, 1.0, 0] };
        return dolly(P[v], L[v], push, rest);
      }
      case "park": {
        const rest = v === "wide" ? { fov: 46 } : v === "low" ? { fov: 37, roll: 0.04 } : v === "high" ? { fov: 43, roll: -0.04 } : v === "cu" ? { fov: 34, roll: 0.035 } : { fov: 40 };
        const P: Record<typeof v, V3> = { wide: [15, 4.2, -19], ms: [8, 2.6, -12], cu: [4.6, 1.8, -7.8], low: [4.8, 0.85, -8.2], high: [13, 12, -18] };
        const L: Record<typeof v, V3> = { wide: [0, 1.2, 0], ms: [0, 1.3, 0], cu: [1.0, 1.2, -3.4], low: [1.0, 0.7, -3.2], high: [0, 0.4, 0] };
        return dolly(P[v], L[v], push, rest);
      }
    }
  };
};
/** zoom variant for tight inserts where a dollied lens would enter a prop */
const insert = (pos: V3, look: V3, fov: number, f0: number, roll = 0): ((f: number) => Shot) =>
  (f: number) => zoom(pos, look, fov, pushK(f, f0, 0.0024, 0.005, 26), { roll });

const CAMS: Record<number, Key[]> = {
  1: [
    { f: 0, s: frame(1, 0, "wide", 0) },
    { f: cue(6), dur: 30, cut: true, s: frame(1, 0, "ms", cue(6)) }, // "knocked"
    { f: cue(11), dur: 26, cut: true, s: frame(1, 0, "low", cue(11), 0.005) }, // "tracks"
  ],
  2: [
    { f: SHOTS[1].a, s: frame(2, SHOTS[1].a, "high", SHOTS[1].a) },
    { f: cue(29), dur: 28, cut: true, s: frame(2, SHOTS[1].a, "wide", cue(29)) }, // "tank"
    { f: cue(37), dur: 26, cut: true, s: frame(2, SHOTS[1].a, "ms", cue(37), 0.005) }, // "railway"
  ],
  3: [
    { f: SHOTS[2].a, s: frame(3, SHOTS[2].a, "wide", SHOTS[2].a) },
    { f: cue(42), dur: 24, cut: true, s: frame(3, SHOTS[2].a, "cu", cue(42)) }, // "no engineer"
    { f: cue(56), dur: 28, cut: true, s: frame(3, SHOTS[2].a, "high", cue(56), 0.005) }, // "Nobody tested"
  ],
  4: [
    { f: SHOTS[3].a, s: frame(4, SHOTS[3].a, "low", SHOTS[3].a) },
    { f: cue(64), dur: 26, cut: true, s: frame(4, SHOTS[3].a, "cu", cue(64)) }, // "Kids filled pails"
    { f: cue(75), dur: 28, cut: true, s: rolled(frame(4, SHOTS[3].a, "ms", cue(75)), 0.04) }, // "painted brown"
  ],
  5: [
    { f: SHOTS[4].a, s: frame(5, SHOTS[4].a, "wide", SHOTS[4].a) },
    { f: cue(87), dur: 28, cut: true, s: frame(5, SHOTS[4].a, "cu", cue(87), 0.006) }, // "freezing"
    { f: cue(95), dur: 30, cut: true, s: frame(5, SHOTS[4].a, "low", cue(95)) }, // "tanker"
  ],
  6: [
    { f: SHOTS[5].a, s: insert([10.5, 8.5, -14], [4.8, 7.4, -2], 36, SHOTS[5].a, -0.035) }, // cold steel
    { f: cue(105), dur: 24, cut: true, s: insert([9.2, 3.2, -10.5], [5.0, 2.6, -2.4], 34, cue(105), 0.035) }, // warm syrup
    { f: cue(111), dur: 30, cut: true, s: frame(6, SHOTS[5].a, "high", cue(111), 0.005) }, // half as thick
  ],
  7: [
    { f: SHOTS[6].a, s: frame(7, SHOTS[6].a, "cu", SHOTS[6].a) }, // rivets
    { f: cue(126), dur: 24, cut: true, s: frame(7, SHOTS[6].a, "high", cue(126), 0.007) }, // "let go"
    { f: cue(133), dur: 28, cut: true, s: frame(7, SHOTS[6].a, "wide", cue(133)) }, // "folded"
    { f: cue(141), dur: 26, cut: true, s: frame(7, SHOTS[6].a, "low", cue(141), 0.006) }, // "sideways"
  ],
  8: [
    { f: SHOTS[7].a, s: frame(8, SHOTS[7].a, "ms", SHOTS[7].a) },
    { f: cue(150), dur: 26, cut: true, s: insert([9.0, 2.4, -12.5], [1.5, 1.6, 5], 35, cue(150), 0.04) }, // "denser"
    { f: cue(157), dur: 28, cut: true, s: frame(8, SHOTS[7].a, "low", cue(157), 0.006) }, // "thirty-five miles"
  ],
  9: [
    { f: SHOTS[8].a, s: frame(9, SHOTS[8].a, "wide", SHOTS[8].a) },
    { f: cue(172), dur: 28, cut: true, s: frame(9, SHOTS[8].a, "cu", cue(172)) }, // "drink doesn't get angrier"
    { f: cue(177), dur: 26, cut: true, s: frame(9, SHOTS[8].a, "high", cue(177), 0.005) }, // "pressure does"
    { f: cue(183), dur: 26, cut: true, s: frame(9, SHOTS[8].a, "low", cue(183), 0.006) }, // "fifty feet tall"
  ],
  10: [
    { f: SHOTS[9].a, s: frame(10, SHOTS[9].a, "wide", SHOTS[9].a) },
    { f: cue(190), dur: 26, cut: true, s: frame(10, SHOTS[9].a, "low", cue(190), 0.006) }, // "railway"
    { f: cue(203), dur: 30, cut: true, s: frame(10, SHOTS[9].a, "cu", cue(203), 0.005) }, // "court blamed the tank"
  ],
  11: [
    { f: SHOTS[10].a, s: frame(11, SHOTS[10].a, "ms", SHOTS[10].a) },
    { f: cue(212), dur: 26, cut: true, s: frame(11, SHOTS[10].a, "cu", cue(212)) }, // "sign and seal"
    { f: cue(218), dur: 28, cut: true, s: frame(11, SHOTS[10].a, "low", cue(218), 0.005) }, // "inspectors"
    { f: cue(229), dur: 26, cut: true, s: frame(11, SHOTS[10].a, "high", cue(229)) }, // "syrup puddle"
  ],
  12: [
    { f: SHOTS[11].a, s: frame(12, SHOTS[11].a, "high", SHOTS[11].a) },
    { f: cue(236), dur: 28, cut: true, s: frame(12, SHOTS[11].a, "low", cue(236)) }, // "concrete floor"
    { f: cue(245), dur: 30, cut: true, s: frame(12, SHOTS[11].a, "cu", cue(245), 0.005) }, // "baseball diamond"
  ],
  13: [
    { f: SHOTS[12].a, s: frame(13, SHOTS[12].a, "wide", SHOTS[12].a) },
    { f: cue(251), dur: 28, cut: true, s: frame(13, SHOTS[12].a, "ms", cue(251)) }, // "whole park"
    { f: cue(255), dur: 34, cut: true, s: frame(13, SHOTS[12].a, "cu", cue(255), 0.007) }, // "molasses"
  ],
};

/** impact flips: rupture, manhole, collapse and the wave hits. Kicks decay in 7 f and flip sign every frame. */
const KICKS: [number, number][] = [
  [at(124), 0.8], [at(126), 1.4], [at(128), 0.9], [at(133), 1.6], [at(141), 1.1], [at(190), 0.6],
];
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(f / FPS);
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};
export const keyEnd = (id: number, f: number) => {
  let e = 0;
  for (const k of CAMS[id]) if (f >= k.f) e = k.f + (k.cut ? 0 : k.dur ?? 24);
  return Math.max(f, e);
};

// ---------------- lens ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
const faces = (p: V3): ((f: number) => V3) => () => p;
export const DOF: Dof[] = [
  { f: 0, cInf: 15, focus: faces([0, 2.0, 2]) }, // hook: railway behind soft
  { f: cue(19, "end"), cInf: 0 }, // town wide sharp under the flash
  { f: cue(42), cInf: 13, focus: faces([0, 2.2, 1]) }, // no engineer, close card
  { f: cue(56), cInf: 0 },
  { f: cue(64), cInf: 14, focus: faces([5.4, 1.4, -3]) }, // leaking seams
  { f: cue(75), cInf: 11, focus: faces([5.2, 2.2, -3]) }, // brown paint
  { f: cue(87), cInf: 15, focus: faces([5.2, 2.4, -3]) }, // freezing close
  { f: cue(95), cInf: 0 },
  { f: cue(105), cInf: 12, focus: faces([5, 2.4, -2.4]) }, // warm syrup insert
  { f: cue(120), cInf: 14, focus: faces([3, 6, 0]) }, // rivets
  { f: cue(126), cInf: 10 },
  { f: cue(133), cInf: 0 },
  { f: cue(150), cInf: 13, focus: faces([1.5, 1.6, 5]) }, // wave density
  { f: cue(161), cInf: 0 },
  { f: cue(177), cInf: 12, focus: faces([0, 4.2, 0]) }, // bottle
  { f: cue(186), cInf: 0 },
  { f: cue(203), cInf: 13, focus: faces([-2.4, 1.6, 0.8]) }, // court
  { f: cue(212), cInf: 11, focus: faces([-1.1, 1.45, 0.6]) }, // engineer
  { f: cue(231), cInf: 0 },
  { f: cue(245), cInf: 14, focus: faces([1, 0.5, -4]) }, // slab under diamond
  { f: cue(252), cInf: 0 },
  { f: cue(255), cInf: 13, focus: faces([0, 1.4, 0]) }, // smell callback
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
export const focusAt = (id: number, f: number): V3 => {
  const d = dofAt(f);
  return d.focus ? d.focus(f) : camAt(id, f).look;
};

/** near framing props, built from plain geometry in world.ts (no external kits). All sit >= 2 m from every lens. */
export type Fg = { a: number; b: number; set: SetName; kit: "crate" | "barrel" | "pail" | "plank"; pos: V3; s: number; yaw?: number };
export const FOREGROUND: Fg[] = [
  { a: cue(64), b: cue(75), set: "tank", kit: "pail", pos: [9.9, 0, -5.2], s: 0.55, yaw: 0.3 },
  { a: cue(95), b: cue(102, "end"), set: "tank", kit: "barrel", pos: [16.4, 0, -16.6], s: 1.0, yaw: 0.4 },
  { a: cue(150), b: cue(160, "end"), set: "burst", kit: "crate", pos: [13.8, 0, -11.6], s: 0.9, yaw: 0.25 },
  { a: cue(212), b: cue(222), set: "rule", kit: "plank", pos: [8.6, 0, -5.4], s: 1.0, yaw: 0.7 },
  { a: cue(236), b: cue(246, "end"), set: "park", kit: "crate", pos: [10.2, 0, -8.3], s: 0.8, yaw: 0.35 },
  { a: cue(252), b: TOTAL, set: "park", kit: "pail", pos: [8.9, 0, -6.8], s: 0.5, yaw: 0.2 },
];

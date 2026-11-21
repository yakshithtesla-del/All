// Story timeline: 40 shots over 113.4 s (30 fps, 3402 frames). Scene boundaries are anchored to the
// narration (words.json): each shot starts when its anchor word starts, so picture always leads/lags
// the voice by a fixed number of frames, never drifts.
import words from "../../../public/voice/words.json";
import type { LightPreset } from "./lights";

export const FPS = 30;
export const TOTAL = 3402; // 113.4 s x 30
export const D0 = 0; // ground level of every set (kept for build.ts contract)

export type V3 = [number, number, number];
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
export const lin = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [a, va] = pts[i - 1], [b, vb] = pts[i];
    return va + ((vb - va) * (x - a)) / (b - a);
  }
  return pts[pts.length - 1][1];
};

// ---- narration anchors ------------------------------------------------------
const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");
/** index of the first word equal to `w` at or after `from` */
const at = (w: string, from = 0): number => {
  const t = norm(w);
  for (let i = from; i < words.length; i++) if (norm((words[i] as { word: string }).word) === t) return i;
  return words.length - 1;
};
const startF = (i: number) => Math.round((words[i] as { start: number }).start * FPS);

// ---- world sets (world.ts builds one Group per key; a shot points its camera at one) ----
export type Set =
  | "campus" | "elon" | "xpost" | "office" | "nvidia" | "gate" | "tpuStage"
  | "data" | "libraryExt" | "libraryInt" | "bedroom" | "earth" | "shelf"
  | "apple" | "desk" | "laptop" | "aerial" | "argon" | "quantum" | "track" | "couch";
export type Light = "day" | "golden" | "night" | "purple" | "rain";
export type ShotDef = { id: number; a: number; b: number; light: Light; set: Set; tau: (t: number) => number; lightO?: Partial<LightPreset> };
// per-shot light overrides (merged over the preset in world.ts). Only fields that truly differ per set go here.
const LIGHT_O: Partial<Record<number, Partial<LightPreset>>> = {
  2: { lit: [0.45, 0.48, 0.66], shade: [0.09, 0.1, 0.17], lift: [0.02, 0.03, 0.08], hemiI: 0.5, sunI: 1.5, charShade: 0.88 },
  4: { lit: [1.22, 1.18, 1.08], shade: [0.24, 0.23, 0.28], lift: [0.04, 0.05, 0.09], hemiI: 0.5 },
  5: { lit: [1.18, 1.15, 1.08], shade: [0.24, 0.23, 0.28], lift: [0.04, 0.05, 0.09], hemiI: 0.5 },
  30: { lit: [1.2, 1.16, 1.06], shade: [0.25, 0.24, 0.29], lift: [0.04, 0.05, 0.09], hemiI: 0.5 },
  32: { lit: [1.22, 1.18, 1.08], shade: [0.24, 0.23, 0.28], lift: [0.04, 0.05, 0.09], hemiI: 0.5 },
  33: { lit: [1.22, 1.18, 1.08], shade: [0.24, 0.23, 0.28], lift: [0.04, 0.05, 0.09], hemiI: 0.5 },
  34: { lit: [1.22, 1.18, 1.08], shade: [0.24, 0.23, 0.28], lift: [0.04, 0.05, 0.09], hemiI: 0.5 },
  35: { lit: [0.72, 0.7, 0.67], shade: [0.14, 0.14, 0.18], lift: [0.02, 0.03, 0.06], hemiI: 0.35, sunI: 1.8 },
  26: { lit: [0.4, 0.43, 0.56], shade: [0.09, 0.1, 0.17], lift: [0.02, 0.03, 0.08], hemiI: 0.45, sunI: 1.4, charShade: 0.9 },
};

type Anchor = [Set, string, number?]; // set, anchor word, search-from index
const A: Anchor[] = [
  ["campus", "everyone", 0],
  ["elon", "then"],
  ["xpost", "google", 8],
  ["office", "how"],
  ["nvidia", "wait"],
  ["gate", "so"],
  ["tpuStage", "tensor"],
  ["tpuStage", "tpu", 40],
  ["data", "now", 42],
  ["libraryExt", "largest"],
  ["libraryInt", "hundreds"],
  ["data", "use"],
  ["data", "needs", 92],
  ["data", "remember"],
  ["data", "looked"],
  ["data", "locations"],
  ["data", "search"],
  ["data", "music"],
  ["data", "talk"],
  ["data", "meet"],
  ["data", "store"],
  ["data", "notes", 168],
  ["data", "numbers", 172],
  ["data", "health"],
  ["data", "passwords"],
  ["bedroom", "even"],
  ["earth", "enough"],
  ["shelf", "already", 210],
  ["shelf", "three"],
  ["apple", "apple"],
  ["data", "connected"],
  ["desk", "reconstruct"],
  ["laptop", "tabs"],
  ["laptop", "watching", 250],
  ["aerial", "notes", 260],
  ["argon", "release"],
  ["quantum", "forget"],
  ["track", "now", 320],
  ["data", "lives", 320],
  ["couch", "oh", 328],
];

// per-shot light: the reference is night/purple in the data center, warm office for the quantum lab, day outside
// NOTE: must be declared BEFORE SHOTS (SHOTS references LIGHTS[i] at module-eval time — a `const` below would TDZ-crash)
const LIGHTS: Light[] = (() => {
  const s = (set: Set): Light => ({ campus: "rain", elon: "night", xpost: "night", office: "day", nvidia: "day", gate: "day", tpuStage: "day", data: "purple", libraryExt: "day", libraryInt: "day", bedroom: "night", earth: "purple", shelf: "purple", apple: "day", desk: "day", laptop: "day", aerial: "day", argon: "purple", quantum: "day", track: "day", couch: "golden" }[set] as Light);
  return A.map(([set]) => s(set));
})();

// one shot per anchor; boundaries at anchor-word starts (plus the narration tail padded to TOTAL)
const bounds = A.map(([set, w, from], i) => {
  const idx = at(w, from ?? 0);
  return { id: i + 1, set, a: startF(idx) };
});
export const SHOTS: ShotDef[] = bounds.map((b, i) => ({
  id: b.id,
  a: b.a,
  b: i + 1 < bounds.length ? bounds[i + 1].a : TOTAL,
  light: LIGHTS[i],
  set: b.set,
  tau: (t) => t,
  ...(LIGHT_O[b.id] ? { lightO: LIGHT_O[b.id] } : {}),
}));

/** crossfades (frames) at place changes; hard cuts everywhere else */
export const XFADE: Record<number, number> = { 10: 8, 11: 8, 12: 8, 27: 8, 29: 8, 31: 8, 32: 8, 36: 8, 37: 8, 40: 8 };
export const FLASH_AT = -1; // the reference uses no white flash

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) {
      const prev = SHOTS[Math.max(0, s.id - 2)];
      return [{ id: prev.id, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
    }
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mix = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
export const camAt = (id: number, f: number): Cam => {
  const keys = CAMS[id];
  if (!keys) return full({ pos: [0, 2, -10], look: [0, 1.5, 0] });
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mix(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (look[1] * 0 + pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k] as V3, look, ...rest });
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });
const rolled = (s: (f: number) => Shot, roll: number) => (f: number): Shot => ({ ...s(f), roll });

// ---- impact kicks (flip-shake decaying over 7 f) -----------------------------
export const KICKS: { f: number; a: number }[] = [];
export const kickAt = (f: number): number => {
  let s = 0;
  for (const k of KICKS) { const d = f - k.f; if (d >= 0 && d < 7) s += k.a * (d % 2 ? 1 : -1) * (1 - d / 7); }
  return s;
};

// ---- DOF per beat -----------------------------------------------------------
export type Dof = { cInf: number; focus?: (f: number) => V3 };
export const dofAt = (f: number): Dof => {
  const s = shotAt(f);
  return DOFS[s.id] ?? { cInf: 0 };
};
const DOFS: Record<number, Dof> = {
  1: { cInf: 12 }, 2: { cInf: 14 }, 3: { cInf: 10 }, 4: { cInf: 12 }, 5: { cInf: 11 },
  6: { cInf: 12 }, 7: { cInf: 14 }, 8: { cInf: 12 }, 9: { cInf: 10 }, 10: { cInf: 12 },
  11: { cInf: 10 }, 12: { cInf: 10 }, 13: { cInf: 12 }, 14: { cInf: 12 }, 15: { cInf: 12 },
  16: { cInf: 12 }, 17: { cInf: 12 }, 18: { cInf: 12 }, 19: { cInf: 12 }, 20: { cInf: 12 },
  21: { cInf: 12 }, 22: { cInf: 12 }, 23: { cInf: 12 }, 24: { cInf: 12 }, 25: { cInf: 12 },
  26: { cInf: 14 }, 27: { cInf: 8 }, 28: { cInf: 10 }, 29: { cInf: 8 }, 30: { cInf: 12 },
  31: { cInf: 10 }, 32: { cInf: 12 }, 33: { cInf: 12 }, 34: { cInf: 12 }, 35: { cInf: 0 },
  36: { cInf: 12 }, 37: { cInf: 10 }, 38: { cInf: 8 }, 39: { cInf: 10 }, 40: { cInf: 12 },
};

/** near framing props per shot (world.ts reads this to place foreground geometry) */
export const FOREGROUND: Record<number, { kind: string; at: V3; size?: number }[]> = {};

// ---- shot framings ----------------------------------------------------------
// Each set has a home coordinate frame; world.ts places every set far apart on a grid so ink/LOD
// distances stay sane. Cameras are authored in the set's LOCAL frame via local(id) -> world offset.
export const SET_HOME: Record<Set, V3> = {
  campus: [0, 0, 0], elon: [400, 0, 0], xpost: [800, 0, 0], office: [1200, 0, 0],
  nvidia: [1600, 0, 0], gate: [2000, 0, 0], tpuStage: [2400, 0, 0], data: [2800, 0, 0],
  libraryExt: [3200, 0, 0], libraryInt: [3600, 0, 0], bedroom: [4000, 0, 0], earth: [4400, 0, 0],
  shelf: [4800, 0, 0], apple: [5200, 0, 0], desk: [5600, 0, 0], laptop: [6000, 0, 0],
  aerial: [6400, 0, 0], argon: [2800, 0, 0], quantum: [6800, 0, 0], track: [7200, 0, 0], couch: [7600, 0, 0],
};
const F = (f: number) => f / FPS; // seconds in shot

// shot 1: rainy campus — establish wide under the rain, push to the falling newspapers
const C1a = (f: number) => dolly([6.5, 3.4, -14], [0, 5.2, 0], pushK(f, 0, 0.002), { fov: 44 });
const C1b = (f: number) => dolly([3.4, 2.6, -9], [-2.2, 2.1, -0.5], pushK(f, 60, 0.0025), { fov: 42, roll: -0.03 });
// shot 2: Elon at the window — MS -> CU on the phone
const C2a = (f: number) => dolly([1.9, 2.35, -7.4], [0, 1.75, -4.6], pushK(f, SHOTS[1].a, 0.002), { fov: 40 });
const C2b = (f: number) => dolly([0.9, 1.95, -6.2], [0.1, 1.72, -4.6], pushK(f, SHOTS[1].a + 40, 0.0022), { fov: 38 });
// shot 3: X post over the campus — low wide -> tilt up the floating card
const C3a = (f: number) => dolly([5.5, 3.0, -9.5], [0, 3.7, 0], pushK(f, SHOTS[2].a, 0.002), { fov: 44 });
const C3b = (f: number) => dolly([2.6, 3.2, -6.5], [0, 3.7, 0], pushK(f, SHOTS[2].a + 50, 0.0025), { fov: 40 });
// shot 4: office wall — pan across the marker wall, down to the chip
const C4a = (f: number) => dolly([1.9, 1.75, -3.6], [0, 1.9, 0], pushK(f, SHOTS[3].a, 0.002), { fov: 44 });
const C4b = (f: number) => dolly([0.3, 1.45, -2.6], [0, 1.55, 0], pushK(f, SHOTS[3].a + 30, 0.0025, 0.005, 25), { fov: 40 });
// shot 5: NVIDIA warehouse — wide with truck, then CU on the sign
const C5a = (f: number) => dolly([7, 3.2, -14], [0, 3.8, -0.5], pushK(f, SHOTS[4].a, 0.002), { fov: 48 });
const C5b = (f: number) => dolly([3.6, 2.9, -8], [-0.6, 3.4, -1.8], pushK(f, SHOTS[4].a + 55, 0.0022), { fov: 44, roll: 0.03 });
// shot 6: Google gate — trucks drive through, avatar driver
const C6a = (f: number) => dolly([7, 2.2, -13], [0, 1.8, -2], pushK(f, SHOTS[5].a, 0.0022), { fov: 44 });
const C6b = (f: number) => dolly([2.6, 1.8, -7.4], [0, 1.6, -2.5], pushK(f, SHOTS[5].a + 30, 0.0024), { fov: 40 });
// shots 7-8: TPU stage — chip rises, name letters, then the TPU card
const C7a = (f: number) => dolly([3.2, 2.1, -7.6], [0, 1.7, 0], pushK(f, SHOTS[6].a, 0.002), { fov: 42 });
const C7b = (f: number) => dolly([1.4, 1.9, -5.2], [0, 2.1, 0], pushK(f, SHOTS[6].a + 35, 0.0022), { fov: 40 });
const C8a = (f: number) => dolly([2.6, 2.0, -6.6], [0, 2.0, 0], pushK(f, SHOTS[7].a, 0.0024, 0.005, 28), { fov: 40 });
// shot 9: data center orb
const C9a = (f: number) => dolly([6.5, 3.2, -12], [0, 2.4, 0], pushK(f, SHOTS[8].a, 0.002), { fov: 44 });
const C9b = (f: number) => dolly([2.8, 2.6, -8], [0, 2.3, -0.5], pushK(f, SHOTS[8].a + 30, 0.0022), { fov: 42, roll: -0.03 });
// shot 10: YouTube library exterior
const C10a = (f: number) => dolly([10, 3.6, -18], [0, 3.4, 0], pushK(f, SHOTS[9].a, 0.002), { fov: 46 });
const C10b = (f: number) => dolly([4.6, 2.8, -10.5], [0, 2.8, -1], pushK(f, SHOTS[9].a + 45, 0.0022), { fov: 42 });
// shot 11: library interior — 500 HOURS/MINUTE sign over the red carpet
const C11a = (f: number) => dolly([0, 2.3, -15], [0, 3.6, 0], pushK(f, SHOTS[10].a, 0.0018), { fov: 46 });
const C11b = (f: number) => dolly([1.0, 2.15, -8.2], [0, 3.3, 1], pushK(f, SHOTS[10].a + 45, 0.0022), { fov: 44, roll: 0.03 });
// shot 12: data center, thumbnails fly into the orb
const C12a = (f: number) => dolly([5.2, 2.8, -10.5], [0, 2.4, -0.5], pushK(f, SHOTS[11].a, 0.002), { fov: 42 });
// shot 13: personal — orb CU
const C13a = (f: number) => dolly([2.4, 2.3, -6.8], [0, 2.25, -0.6], pushK(f, SHOTS[12].a, 0.0022), { fov: 40 });
// shot 14: remember — icons fan out over the avatar
const C14a = (f: number) => dolly([4.6, 2.6, -9.4], [0, 2.2, -0.5], pushK(f, SHOTS[13].a, 0.0022), { fov: 44 });
const C14b = (f: number) => dolly([0.6, 2.05, -5.6], [0, 1.95, -1.2], pushK(f, SHOTS[13].a + 45, 0.002), { fov: 42, roll: 0.03 });
// shots 15-25: service panels — one framing each, closer on the name word
const panelCam = (i: number, closer: V3, look: V3) => (f: number) =>
  dolly(closer, look, pushK(f, SHOTS[i - 1].a, 0.0022, 0.004, 22), { fov: 40, roll: ((i % 3) - 1) * 0.025 });
const P_FAR: V3 = [3.4, 2.5, -7.6]; const P_NEAR: V3 = [1.1, 2.0, -5.2];
const C15a = panelCam(15, P_FAR, [0, 2.3, -0.8]);
const C15b = panelCam(15, P_NEAR, [0, 2.15, -1.0]);
const C16a = panelCam(16, P_FAR, [0, 2.3, -0.8]);
const C16b = panelCam(16, P_NEAR, [0, 2.15, -1.0]);
const C17a = panelCam(17, P_FAR, [0, 2.3, -0.8]);
const C17b = panelCam(17, P_NEAR, [0, 2.15, -1.0]);
const C18a = panelCam(18, P_FAR, [0, 2.3, -0.8]);
const C18b = panelCam(18, P_NEAR, [0, 2.15, -1.0]);
const C19a = panelCam(19, P_FAR, [0, 2.3, -0.8]);
const C19b = panelCam(19, P_NEAR, [0, 2.15, -1.0]);
const C20a = panelCam(20, P_FAR, [0, 2.3, -0.8]);
const C20b = panelCam(20, P_NEAR, [0, 2.15, -1.0]);
const C21a = panelCam(21, P_FAR, [0, 2.3, -0.8]);
const C21b = panelCam(21, P_NEAR, [0, 2.15, -1.0]);
const C22a = panelCam(22, P_FAR, [0, 2.3, -0.8]);
const C22b = panelCam(22, P_NEAR, [0, 2.15, -1.0]);
const C23a = panelCam(23, P_FAR, [0, 2.3, -0.8]);
const C23b = panelCam(23, P_NEAR, [0, 2.15, -1.0]);
const C24a = panelCam(24, P_FAR, [0, 2.3, -0.8]);
const C24b = panelCam(24, P_NEAR, [0, 2.15, -1.0]);
const C25a = panelCam(25, P_FAR, [0, 2.3, -0.8]);
const C25b = panelCam(25, P_NEAR, [0, 2.15, -1.0]);
// shot 26: bedroom — kid with tablet, Gmail reset codes
const C26a = (f: number) => dolly([3.1, 1.9, -6.4], [0, 1.35, -3.6], pushK(f, SHOTS[25].a, 0.002), { fov: 44 });
const C26b = (f: number) => dolly([0.8, 1.55, -4.6], [0, 1.4, -3.6], pushK(f, SHOTS[25].a + 50, 0.0022), { fov: 40, roll: -0.03 });
// shot 27: Earth — globe in space
const C27a = (f: number) => dolly([5.5, 2.6, -10], [0, 1.6, 0], pushK(f, SHOTS[26].a, 0.002), { fov: 44 });
const C27b = (f: number) => dolly([2.2, 2.0, -6.4], [0, 1.6, 0], pushK(f, SHOTS[26].a + 40, 0.0022), { fov: 40 });
// shots 28-29: phone shelf — 7/10 then the iPhone end
const C28a = (f: number) => dolly([5.2, 2.6, -10], [0, 1.7, 0], pushK(f, SHOTS[27].a, 0.002), { fov: 44 });
const C28b = (f: number) => dolly([2.0, 1.9, -6], [0, 1.55, 0], pushK(f, SHOTS[27].a + 45, 0.0022), { fov: 40 });
const C29a = (f: number) => dolly([-3.4, 2.0, -7.6], [-1.6, 1.5, 0], pushK(f, SHOTS[28].a, 0.0022), { fov: 42, roll: -0.03 });
// shot 30: Apple store — Apple walks in, picks Gemini
const C30a = (f: number) => dolly([6.2, 2.4, -11], [0, 1.8, 0], pushK(f, SHOTS[29].a, 0.002), { fov: 44 });
const C30b = (f: number) => dolly([1.6, 1.7, -5.6], [0.4, 1.5, -0.6], pushK(f, SHOTS[29].a + 45, 0.0022), { fov: 40 });
// shot 31: every dot is connected — fan arc around the avatar
const C31a = (f: number) => dolly([4.2, 2.7, -8.6], [0, 2.1, -0.6], pushK(f, SHOTS[30].a, 0.002), { fov: 44 });
const C31b = (f: number) => dolly([0.4, 2.0, -5.2], [0, 1.9, -1], pushK(f, SHOTS[30].a + 40, 0.0024), { fov: 40, roll: 0.03 });
// shot 32: desk calendar 2018 -> 2015
const C32a = (f: number) => dolly([2.9, 2.2, -4.8], [0, 0.72, 0], pushK(f, SHOTS[31].a, 0.002), { fov: 44 });
const C32b = (f: number) => dolly([0.6, 1.5, -3.8], [0, 1.3, 0], pushK(f, SHOTS[31].a + 55, 0.0025, 0.005, 25), { fov: 40 });
// shots 33-34: laptop — Chrome history, YouTube
const C33a = (f: number) => dolly([2.3, 1.9, -3.6], [0, 0.68, 0], pushK(f, SHOTS[32].a, 0.0022), { fov: 42 });
const C34a = (f: number) => dolly([-1.7, 1.85, -3.4], [0, 0.68, 0], pushK(f, SHOTS[33].a, 0.0022), { fov: 42, roll: -0.03 });
// shot 35: aerial town
const C35a = (f: number) => dolly([6, 9.5, -12], [0, 0, 0], pushK(f, SHOTS[34].a, 0.0018), { fov: 46 });
const C35b = (f: number) => dolly([2.6, 6.5, -7], [0, 0, 0], pushK(f, SHOTS[34].a + 50, 0.0022), { fov: 44 });
// shot 36: Gemini Argon title over the orb
const C36a = (f: number) => dolly([4.4, 2.7, -8.8], [0, 2.5, -0.5], pushK(f, SHOTS[35].a, 0.0022, 0.005, 30), { fov: 42 });
// shot 37: quantum lab chandelier
const C37a = (f: number) => dolly([4.8, 2.4, -9], [0, 2.6, 0], pushK(f, SHOTS[36].a, 0.002), { fov: 44 });
const C37b = (f: number) => dolly([1.8, 2.3, -6], [0, 2.5, -0.6], pushK(f, SHOTS[36].a + 60, 0.0022), { fov: 42, roll: -0.03 });
// shot 38: F1 finish
const C38a = (f: number) => dolly([9, 2.8, -18], [0, 2.2, 0], pushK(f, SHOTS[37].a, 0.002), { fov: 46 });
const C38b = (f: number) => dolly([4.2, 2.2, -10.5], [-0.6, 1.8, -0.5], pushK(f, SHOTS[37].a + 45, 0.0022), { fov: 42, roll: -0.03 });
// shot 39: fan arc again
const C39a = (f: number) => dolly([3.6, 2.6, -8], [0, 2.1, -0.6], pushK(f, SHOTS[38].a, 0.0022), { fov: 42 });
// shot 40: couch ending
const C40a = (f: number) => dolly([3.8, 2.2, -7.6], [0, 1.5, -3], pushK(f, SHOTS[39].a, 0.002), { fov: 44 });
const C40b = (f: number) => dolly([3.0, 2.05, -7.2], [-0.55, 1.55, -2.5], pushK(f, SHOTS[39].a + 40, 0.0022), { fov: 42 });

const CAMS: Record<number, Key[]> = {
  1: [{ f: 0, s: C1a }, { f: SHOTS[0].a + 58, s: C1b }],
  2: [{ f: SHOTS[1].a, s: C2a }, { f: SHOTS[1].a + 42, s: C2b }],
  3: [{ f: SHOTS[2].a, s: C3a }],
  4: [{ f: SHOTS[3].a, s: C4a }, { f: SHOTS[3].a + 34, s: C4b }],
  5: [{ f: SHOTS[4].a, s: C5a }, { f: SHOTS[4].a + 56, s: C5b }],
  6: [{ f: SHOTS[5].a, s: C6a }, { f: SHOTS[5].a + 32, s: C6b }],
  7: [{ f: SHOTS[6].a, s: C7a }, { f: SHOTS[6].a + 36, s: C7b }],
  8: [{ f: SHOTS[7].a, s: C8a }],
  9: [{ f: SHOTS[8].a, s: C9a }, { f: SHOTS[8].a + 32, s: C9b }],
  10: [{ f: SHOTS[9].a, s: C10a }, { f: SHOTS[9].a + 46, s: C10b }],
  11: [{ f: SHOTS[10].a, s: C11a }, { f: SHOTS[10].a + 46, s: C11b }],
  12: [{ f: SHOTS[11].a, s: C12a }],
  13: [{ f: SHOTS[12].a, s: C13a }],
  14: [{ f: SHOTS[13].a, s: C14a }, { f: SHOTS[13].a + 46, s: C14b }],
  15: [{ f: SHOTS[14].a, s: C15a }, { f: SHOTS[14].a + 30, s: C15b }],
  16: [{ f: SHOTS[15].a, s: C16a }, { f: SHOTS[15].a + 30, s: C16b }],
  17: [{ f: SHOTS[16].a, s: C17a }, { f: SHOTS[16].a + 30, s: C17b }],
  18: [{ f: SHOTS[17].a, s: C18a }, { f: SHOTS[17].a + 30, s: C18b }],
  19: [{ f: SHOTS[18].a, s: C19a }, { f: SHOTS[18].a + 30, s: C19b }],
  20: [{ f: SHOTS[19].a, s: C20a }, { f: SHOTS[19].a + 30, s: C20b }],
  21: [{ f: SHOTS[20].a, s: C21a }, { f: SHOTS[20].a + 30, s: C21b }],
  22: [{ f: SHOTS[21].a, s: C22a }, { f: SHOTS[21].a + 30, s: C22b }],
  23: [{ f: SHOTS[22].a, s: C23a }, { f: SHOTS[22].a + 30, s: C23b }],
  24: [{ f: SHOTS[23].a, s: C24a }, { f: SHOTS[23].a + 30, s: C24b }],
  25: [{ f: SHOTS[24].a, s: C25a }, { f: SHOTS[24].a + 30, s: C25b }],
  26: [{ f: SHOTS[25].a, s: C26a }, { f: SHOTS[25].a + 50, s: C26b }],
  27: [{ f: SHOTS[26].a, s: C27a }, { f: SHOTS[26].a + 42, s: C27b }],
  28: [{ f: SHOTS[27].a, s: C28a }, { f: SHOTS[27].a + 46, s: C28b }],
  29: [{ f: SHOTS[28].a, s: C29a }],
  30: [{ f: SHOTS[29].a, s: C30a }, { f: SHOTS[29].a + 46, s: C30b }],
  31: [{ f: SHOTS[30].a, s: C31a }, { f: SHOTS[30].a + 42, s: C31b }],
  32: [{ f: SHOTS[31].a, s: C32a }, { f: SHOTS[31].a + 56, s: C32b }],
  33: [{ f: SHOTS[32].a, s: C33a }],
  34: [{ f: SHOTS[33].a, s: C34a }],
  35: [{ f: SHOTS[34].a, s: C35a }, { f: SHOTS[34].a + 50, s: C35b }],
  36: [{ f: SHOTS[35].a, s: C36a }],
  37: [{ f: SHOTS[36].a, s: C37a }, { f: SHOTS[36].a + 60, s: C37b }],
  38: [{ f: SHOTS[37].a, s: C38a }, { f: SHOTS[37].a + 46, s: C38b }],
  39: [{ f: SHOTS[38].a, s: C39a }],
  40: [{ f: SHOTS[39].a, s: C40a }, { f: SHOTS[39].a + 42, s: C40b }],
};

export { rolled };

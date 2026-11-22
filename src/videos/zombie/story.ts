// Timeline for the zombie sample stills. Two shots, no narration: a night street hook and a purple "how it spreads"
// mechanism zoom. Camera grammar, DOF and light presets follow the study-3d-short pipeline (see references/STYLE_BIBLE).
export const FPS = 30;
export const TOTAL = 180; // 6 s of timeline; only two frames are rendered
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };

export type SetName = "street" | "outbreak";
export type Light = "night" | "purple";
export type ShotDef = { id: number; a: number; b: number; light: Light; set: SetName };

export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 120, light: "night", set: "street" },
  { id: 2, a: 120, b: TOTAL, light: "purple", set: "outbreak" },
];

export const FLASH_AT = 1e9;
export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => [{ id: shotAt(f).id, alpha: 1 }];

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
const mix = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** every shot creeps toward its subject; no static holds */
export const camAt = (id: number, f: number): Cam => {
  if (id === 1) {
    const k = glide((f - SHOTS[0].a) / (SHOTS[0].b - SHOTS[0].a));
    return { pos: mix([9.5, 2.8, -18], [6.2, 2.2, -11.5], k), look: mix([0, 1.95, 6], [-0.2, 1.85, 5.6], k), fov: 44 - 4 * k, roll: -0.018 };
  }
  const k = glide((f - SHOTS[1].a) / (SHOTS[1].b - SHOTS[1].a));
  return { pos: mix([4.6, 1.75, -8.2], [3.5, 1.65, -6.6], k), look: mix([-0.3, 1.55, 3.4], [-0.3, 1.5, 3.2], k), fov: 36 - 3 * k, roll: 0.028 };
};

// ---------------- lens ----------------
export type Dof = { f: number; cInf: number; focus: V3 };
export const DOF: Dof[] = [
  { f: 0, cInf: 14, focus: [0, 1.35, 3] },      // street: foggy buildings and cars fall soft
  { f: 120, cInf: 12, focus: [-0.3, 1.5, 3.2] }, // mechanism zoom: patient zero sharp
];
export const dofAt = (f: number) => (f >= DOF[1].f ? DOF[1] : DOF[0]);

// PART 1 — "THE THING OUTSIDE". 90 s, six shots, anchored to the narration in public/audio/part1/mix.wav.
// Shot boundaries follow the sentence timings: 15.9 / 26.1 / 41.7 / 55.6 / 58.9 / 71.4 s.
export const FPS = 30;
export const TOTAL = 2700;
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mix = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

export type Cam = { pos: V3; look: V3; fov: number; roll: number };
export type ShotDef = { id: number; a: number; b: number; light: "night" };
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 477, light: "night" },     // 0–15.9 s  stocking / finish / walk across
  { id: 2, a: 477, b: 783, light: "night" },   // 15.9–26.1 s  glass doors come into view
  { id: 3, a: 783, b: 1251, light: "night" },  // 26.1–41.7 s  the limping figure at the car
  { id: 4, a: 1251, b: 1668, light: "night" }, // 41.7–55.6 s  close study through the glass
  { id: 5, a: 1668, b: 1767, light: "night" }, // 55.6–58.9 s  it turns / "that's not a person"
  { id: 6, a: 1767, b: 2142, light: "night" }, // 58.9–71.4 s  shutter slams down
  { id: 7, a: 2142, b: 2700, light: "night" }, // 71.4–90 s  relief, then it looks up at camera
];
export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => [{ id: shotAt(f).id, alpha: 1 }];

/** Each shot creeps toward its subject — the reference grammar never holds a frame still. */
export const camAt = (id: number, f: number): Cam => {
  const s = SHOTS[id - 1], k = glide((f - s.a) / (s.b - s.a));
  switch (id) {
    case 1: return { pos: mix([0.75, 1.78, -8.4], [0.35, 1.72, -6.8], k), look: mix([0, 1.5, 6.5], [0, 1.48, 7.2], k), fov: 56 - 3 * k, roll: -0.008 };
    case 2: return { pos: mix([0.4, 1.76, 4.5], [0.15, 1.72, 8.5], k), look: mix([0, 1.5, 20], [0, 1.5, 21.5], k), fov: 50 - 3 * k, roll: -0.005 };
    case 3: return { pos: mix([0.2, 1.72, 12], [0.05, 1.68, 15.5], k), look: mix([-1.6, 1.4, 26], [-1.9, 1.38, 26], k), fov: 42 - 3 * k, roll: 0.006 };
    case 4: return { pos: mix([0, 1.68, 16.2], [-0.1, 1.66, 18.2], k), look: mix([-2.0, 1.35, 26], [-2.1, 1.35, 26], k), fov: 36 - 2 * k, roll: 0.01 };
    case 5: return { pos: mix([-0.1, 1.66, 18.2], [-0.05, 1.64, 18.8], k), look: mix([-2.1, 1.35, 26], [-2.15, 1.35, 26], k), fov: 34 - 2 * k, roll: 0.012 };
    case 6: return { pos: mix([1.6, 1.72, 15.5], [1.1, 1.68, 17.5], k), look: mix([2.7, 1.35, 21.8], [2.7, 1.45, 22], k), fov: 44 - 3 * k, roll: -0.014 };
    default: return { pos: mix([0.6, 1.72, 14.5], [0.2, 1.68, 17], k), look: mix([-1.9, 1.45, 25.5], [-2.0, 1.5, 25.5], k), fov: 46 - 4 * k, roll: -0.006 };
  }
};

export type Dof = { focus: V3; cInf: number };
export const dofAt = (f: number): Dof => {
  const id = shotAt(f).id;
  if (id === 1) return { focus: [1.4, 1.4, 2.4], cInf: 6 };
  if (id <= 5) return { focus: [-2, 1.4, 25.5], cInf: 7 };
  return { focus: [0, 1.5, 22], cInf: 8 };
};

/** 0 -> 1 as the steel shutter grinds down (shot 6). */
export const shutterAt = (f: number) => {
  if (f < 1767) return 0;
  if (f > 2130) return 1;
  return glide((f - 1767) / (2130 - 1767));
};

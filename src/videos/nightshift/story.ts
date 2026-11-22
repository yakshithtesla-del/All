// Opening of Part 1: Mara stocking Aisle 9, 11:59 p.m., store empty, glass automatic doors at the far end.
export const FPS = 30;
export const TOTAL = 2700;
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };

export type SetName = "aisle";
export type Light = "night";
export type ShotDef = { id: number; a: number; b: number; light: Light; set: SetName };
export const SHOTS: ShotDef[] = [{ id: 1, a: 0, b: TOTAL, light: "night", set: "aisle" }];
export const FLASH_AT = 1e9;
export const shotAt = () => SHOTS[0];
export const layersAt = (): { id: number; alpha: number }[] => [{ id: 1, alpha: 1 }];

export type Cam = { pos: V3; look: V3; fov: number; roll: number };
const mix = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** Wide-angle creep straight down the aisle so both shelf runs and the glass doors stay in frame.
 *  NOTE: vertical FOV on a 1080x1920 canvas gives only ~33 deg horizontal at fov=55; that is what
 *  keeps the shelving visible instead of cropping it away. */
export const camAt = (_id: number, f: number): Cam => {
  const k = glide(f / TOTAL);
  return {
    pos: mix([0.75, 1.78, -8.4], [0.35, 1.72, -6.8], k),
    look: mix([0, 1.5, 6.5], [0, 1.48, 7.2], k),
    fov: 56 - 3 * k,
    roll: -0.008,
  };
};
export type Dof = { focus: V3; cInf: number };
export const dofAt = (): Dof => ({ focus: [1.4, 1.4, 2.4], cInf: 6 });

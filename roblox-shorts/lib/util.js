// Small helpers shared by every scene and style. Everything is a pure function of time,
// so any frame can be drawn in any order.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, t) => a + (b - a) * t
/** Progress 0..1 of `t` inside the window [a, b]. */
export const range = (t, a, b) => clamp((t - a) / (b - a))
/** 0 → 1 → 0 over p (0..1). */
export const pulse = (p) => Math.sin(clamp(p) * Math.PI)

export const ease = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2) },
  elastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
}

/** Seeded random generator: same seed, same numbers, every render. */
export function rng(seed = 1) {
  let s = (seed >>> 0) || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

// Shared bits for the blocky look. Call setThree(THREE) once in a scene's create() before anything else.
export let T = null
export function setThree(three) { T = three }
export const D = (a) => (a * Math.PI) / 180
export const cl = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const ease = (t) => { t = cl(t); return t * t * (3 - 2 * t) }
/** 0 -> 1 with a little overshoot: the snappy pose change the real shorts use (kit pop()). */
export const pop = (t, t0, d = 0.22) => { const x = cl((t - t0) / d); return x < 1 ? 1 + 0.18 * Math.sin(x * Math.PI) * (1 - x) * 2 - (1 - x) ** 3 : 1 }
let seed = 11
export const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
/** 0-255 sRGB triple -> THREE.Color */
export const srgb = (c) => new T.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, T.SRGBColorSpace)

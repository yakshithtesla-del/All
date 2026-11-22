// Synthesized sound effects and room beds, each with a natural level ("naive", LU relative to the voice); the mix
// places every event 6 dB under its naive level, the way the claude-animated-shorts kit does (MIT, with permission).
// SFX[name](r) -> mono Float32Array or [L,R]. BEDS[name](dur, r) -> [L,R].
import { SR, TAU, ns, noise, wobble, lp, hp, bp, sweep, modal, chirp, fades, shape, widen, pan, stereo, place, m2f } from './dsp.mjs'
import { glock, bell, timpani, cymbal, snare } from './instruments.mjs'

const mix = (...xs) => { const n = Math.max(...xs.map((x) => x.length)), y = new Float32Array(n); for (const x of xs) for (let i = 0; i < x.length; i++) y[i] += x[i]; return y }
const at = (x, t, n) => { const y = new Float32Array(n); y.set(x.subarray(0, Math.max(0, n - ns(t))), ns(t)); return y }

/** Noise whoosh: the band and level rise to `peak` (s) then fall; an early peak = ease-out burst. */
export function whoosh(dur, r, peak = 0.3, lo = 350, hi = 2200, tail = 0.25) {
  const n = ns(dur), up = (t) => t < peak ? t / peak : Math.exp(-(t - peak) / (tail * 1.3))
  const y = sweep(noise(n, r, 'pink'), (t) => lo + (hi - lo) * up(t), 0.9), air = hp(noise(n, r), 4000)
  for (let i = 0; i < n; i++) { const t = i / SR, e = t < peak ? (t / peak) ** 2.2 : Math.exp(-(t - peak) / tail); y[i] = (y[i] * 3 + air[i] * 0.15 * e) * e }
  return fades(y, 0.005, 0.04)
}

export const SFX = {
  // movement / transitions
  whoosh: { naive: -12, make: (r) => whoosh(0.7, r, 0.28) },
  swish: { naive: -14, make: (r) => whoosh(0.3, r, 0.07, 900, 4200, 0.1) },
  swoosh_up: { naive: -12, make: (r) => whoosh(0.6, r, 0.45, 300, 5000, 0.12) },
  riser: { naive: -10, make: (r) => { const d = 2.2, n = ns(d), x = sweep(noise(n, r, 'pink'), (t) => 300 + 6000 * (t / d) ** 2, 1.5), tn = chirp(d, (t) => 180 * 2 ** (2.5 * t / d), (t) => 0.25 * t / d)
    for (let i = 0; i < n; i++) x[i] = (x[i] * 2 + tn[i]) * (i / n) ** 2; return fades(x, 0.01, 0.01) } },
  // impacts
  boom: { naive: -6, make: (r) => mix(chirp(2, (t) => 55 * Math.exp(-t / 0.6) + 28, (t) => Math.exp(-t / 0.7)), shape(lp(noise(ns(1), r, 'brown'), 160), (t) => 4 * Math.exp(-t / 0.25))) },
  thud: { naive: -10, make: (r) => mix(modal(0.4, [[r.u(80, 100), 1, 0.12], [r.u(150, 190), 0.5, 0.06]], r), shape(lp(noise(ns(0.15), r, 'pink'), 400), (t) => 1.5 * Math.exp(-t / 0.03))) },
  hit: { naive: -6, make: (r) => mix(timpani(m2f(38), 1, r, 1.8), Array.from(cymbal(0.5, r, 1.6))) },
  // UI / cartoon
  pop: { naive: -12, make: (r) => fades(chirp(0.12, (t) => 950 * Math.exp(-t / 0.025) + 280, (t) => Math.exp(-t / 0.04)), 0.001, 0.02) },
  click: { naive: -16, make: (r) => mix(modal(0.05, [[r.u(2800, 3400), 1, 0.006]], r), shape(hp(noise(ns(0.01), r), 3000), (t) => Math.exp(-t / 0.002))) },
  tick: { naive: -20, make: (r) => modal(0.08, [[r.u(2400, 2700), 1, 0.006], [5200, 0.5, 0.003]], r) },
  ding: { naive: -10, make: (r) => bell(m2f(84), 0.8, r, 1.6) },
  sparkle: { naive: -14, make: (r) => { const y = new Float32Array(ns(1.4)); [84, 88, 91, 96, 100].forEach((m, k) => place([y, new Float32Array(y.length)], glock(m2f(m), 0.5 - k * 0.05, r, 0.9), k * 0.05)); return y } },
  correct: { naive: -10, make: (r) => { const y = new Float32Array(ns(0.9)); [72, 76, 79].forEach((m, k) => place([y, new Float32Array(y.length)], bell(m2f(m), 0.7, r, 0.6), k * 0.11)); return y } },
  wrong: { naive: -10, make: (r) => { const t = (i) => i / SR, n = ns(0.5), y = new Float32Array(n); for (let i = 0; i < n; i++) { const f = t(i) < 0.22 ? 233 : 175; y[i] = (Math.sin(TAU * f * t(i)) + 0.4 * Math.sin(TAU * 2 * f * t(i))) * Math.exp(-5 * (t(i) % 0.22)) * 0.6 } return fades(y, 0.003, 0.05) } },
  bubble: { naive: -14, make: (r) => fades(chirp(0.15, (t) => 400 + 6000 * t, (t) => Math.exp(-t / 0.05)), 0.002, 0.02) },
  beep: { naive: -13, make: (r) => fades(chirp(0.12, () => 1000), 0.004, 0.02) },
  alarm: { naive: -12, make: (r) => fades(chirp(1.6, (t) => ((t * 2.5) % 1 < 0.5 ? 880 : 660), (t) => Math.exp(-t / 1.4)), 0.005, 0.1) },
  static: { naive: -6, make: (r) => { const n = ns(1), x = bp(noise(n, r), 900, 6000), w = wobble(n, r, 30); for (let i = 0; i < n; i++) x[i] *= (0.6 + 0.4 * w[i]) * (i < n * 0.7 ? 1 : ((n - i) / (n * 0.3)) ** 3); return fades(x, 0.002, 0.02) } },
  // real-world
  typing: { naive: -16, make: (r) => { const y = new Float32Array(ns(1.6)); for (let t = 0; t < 1.5; t += r.u(0.07, 0.16)) place([y, new Float32Array(y.length)], modal(0.04, [[r.u(1800, 3200), 1, 0.005], [r.u(500, 900), 0.4, 0.01]], r), t); return y } },
  paper: { naive: -16, make: (r) => { const n = ns(0.35), x = bp(noise(n, r), 2000, 7000), w = wobble(n, r, 40); for (let i = 0; i < n; i++) x[i] *= Math.max(0, w[i]) * Math.sin(Math.PI * i / n); return x } },
  camera: { naive: -12, make: (r) => mix(modal(0.03, [[3000, 1, 0.004]], r), at(shape(bp(noise(ns(0.08), r), 1500, 6000), (t) => Math.exp(-t / 0.02)), 0.03, ns(0.12))) },
  cash: { naive: -10, make: (r) => mix(bell(m2f(88), 0.7, r, 1.2), at(modal(0.3, [[r.u(3000, 4000), 1, 0.05], [r.u(5000, 6000), 0.6, 0.03]], r), 0.12, ns(1.2))) },
  phone_ring: { naive: -8, make: (r) => { const n = ns(1.3), y = new Float32Array(n); for (const k0 of [0, 0.62]) { const m = ns(0.45); for (let i = 0; i < m; i++) { const t = i / SR, g = Math.sin(TAU * 20 * t) > 0 ? 1 : 0.4; y[ns(k0) + i] += (Math.sin(TAU * 1180 * t) + 0.6 * Math.sin(TAU * 1420 * t)) * g * 0.5 } } return fades(y, 0.005, 0.03) } },
  door: { naive: -10, make: (r) => mix(modal(0.6, [[r.u(90, 120), 1, 0.15], [r.u(240, 300), 0.5, 0.08], [r.u(700, 900), 0.2, 0.03]], r), at(shape(bp(noise(ns(0.4), r), 300, 2000), (t) => 0.3 * Math.exp(-t / 0.1)), 0, ns(0.6))) },
  footstep: { naive: -18, make: (r) => mix(modal(0.12, [[r.u(90, 140), 1, 0.03]], r), shape(bp(noise(ns(0.08), r), 300, 3000), (t) => 0.6 * Math.exp(-t / 0.015))) },
  splash: { naive: -8, make: (r) => { const n = ns(1.2), x = bp(noise(n, r), 400, 6000); for (let i = 0; i < n; i++) { const t = i / SR; x[i] *= Math.min(1, t / 0.02) * Math.exp(-t / 0.3) } return x } },
  crowd_cheer: { naive: -10, make: (r) => { const n = ns(2.8), y = stereo(n); for (let p = 0; p < 18; p++) { const f0 = r.u(110, 260), a = r.u(0.05, 0.4), d = r.u(0.8, 1.8); place(y, pan(shape(bp(chirp(d, (t) => f0 * (1 + 0.15 * Math.sin(TAU * r.u(3, 6) * t)) * (1 + 0.3 * t)), f0, f0 * 8), (t) => Math.min(1, t / 0.08) * Math.exp(-t / d)), r.u(-0.8, 0.8)), a) }
    for (let c = 0; c < 140; c++) place(y, pan(shape(bp(noise(ns(0.04), r), 900, 3000), (t) => Math.exp(-t / 0.007)), r.u(-0.9, 0.9)), r.u(0.1, 2.6)); return y } },
  heartbeat: { naive: -10, make: (r) => mix(modal(0.4, [[55, 1, 0.08]], r), at(modal(0.3, [[48, 0.7, 0.07]], r), 0.28, ns(0.9))) },
  engine: { naive: -4, make: (r) => { const d = 5, n = ns(d), rum = lp(noise(n, r, 'brown'), 260), body = bp(noise(n, r, 'pink'), 120, 1800); for (let i = 0; i < n; i++) { const t = i / SR; rum[i] = (rum[i] * 6 + body[i]) * Math.min(1, t / 0.35) * (t > d - 1 ? (d - t) : 1) } return widen(rum) } },
}

/** Room beds (integrated loudness ~24-32 LU under the voice). */
export const BEDS = {
  room: { naive: -30, make: (d, r) => { const n = ns(d), x = lp(noise(n, r, 'pink'), 1800), w = wobble(n, r, 0.4); for (let i = 0; i < n; i++) { const t = i / SR; x[i] = x[i] * (0.85 + 0.15 * w[i]) + 0.04 * (Math.sin(TAU * 60 * t) + Math.sin(TAU * 120 * t) / 2) } return widen(x, 12, 0.5) } },
  office: { naive: -29, make: (d, r) => { const b = BEDS.room.make(d, r); for (let t = r.u(0.5, 2); t < d - 2; t += r.u(3, 7)) place(b, pan(SFX.typing.make(r), r.u(-0.7, 0.7)), t, 0.15); return b } },
  city: { naive: -27, make: (d, r) => { const n = ns(d), x = lp(noise(n, r, 'brown'), 700), w = wobble(n, r, 0.15); for (let i = 0; i < n; i++) x[i] *= 2 * (0.6 + 0.4 * w[i]); return widen(x, 15, 0.7) } },
  nature: { naive: -28, make: (d, r) => { const n = ns(d), b = widen(hp(lp(noise(n, r, 'pink'), 900), 120), 13, 0.6), w = wobble(n, r, 0.2); for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) b[c][i] *= 0.6 + 0.4 * w[i]
    for (let t = r.u(0.3, 1); t < d - 0.5; t += r.u(0.6, 2.2)) { const f = r.u(2800, 4800); place(b, pan(chirp(r.u(0.06, 0.14), (tt) => f * (1 + 0.25 * Math.sin(TAU * 18 * tt)), (tt) => Math.sin(Math.PI * tt / 0.14) * 0.05), r.u(-0.8, 0.8)), t) } return b } },
  night: { naive: -30, make: (d, r) => { const b = BEDS.room.make(d, r); for (let v = 0; v < 3; v++) { const f = r.u(4200, 5200), p = r.u(-0.7, 0.7); for (let t = r.u(0, 1); t < d - 0.3; t += r.u(0.6, 1.1)) place(b, pan(chirp(0.18, () => f, (tt) => (Math.sin(TAU * 30 * tt) > 0 ? 0.03 : 0)), p), t) } return b } },
  ocean: { naive: -26, make: (d, r) => { const n = ns(d), x = lp(noise(n, r, 'pink'), 1000), w = wobble(n, r, 0.12); for (let i = 0; i < n; i++) x[i] *= 1.5 * (0.35 + 0.65 * Math.max(0, w[i])); return widen(x, 17, 0.7) } },
  rain: { naive: -26, make: (d, r) => { const n = ns(d), x = bp(noise(n, r), 800, 9000), b = widen(x, 9, 0.8); for (let k = 0; k < d * 25; k++) place(b, pan(modal(0.03, [[r.u(2000, 6000), 0.2, 0.004]], r), r.u(-1, 1)), r.u(0, d)); return b } },
  space: { naive: -30, make: (d, r) => { const n = ns(d), x = lp(noise(n, r, 'brown'), 200), w = wobble(n, r, 0.1); for (let i = 0; i < n; i++) x[i] *= 2 * (0.7 + 0.3 * w[i]) + 0.02 * Math.sin(TAU * 55 * i / SR); return widen(x, 20, 0.8) } },
}

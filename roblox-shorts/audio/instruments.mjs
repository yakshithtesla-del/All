// Synthesized instruments for the score (additive / modal synthesis, plain JS). Mono unless noted.
// Modelled on the claude-animated-shorts instruments.py (MIT, used with the author's permission).
import { SR, TAU, ns, noise, lp, hp, bp, modal, fades, stereo } from './dsp.mjs'

const env = (n, att, hold, rel) => { const e = new Float32Array(n), a = Math.max(1, ns(att)), h = ns(hold); for (let i = 0; i < n; i++) e[i] = i < a ? (i / a) ** 1.5 : i < h ? 1 : Math.max(0, 1 - (i - h) / Math.max(1, n - h)) ** 2; return e }

/** Band-limited wavetable (one cycle) with partial amplitudes amp(k). */
function table(K, amp, size = 2048) { const t = new Float32Array(size + 1); for (let k = 1; k <= K; k++) { const a = amp(k); if (!a) continue; for (let i = 0; i <= size; i++) t[i] += a * Math.sin(TAU * k * i / size) } return t }
function osc(tab, f, n, detuneCents = () => 0, ph0 = 0) {
  const size = tab.length - 1, y = new Float32Array(n); let ph = ph0 * size
  for (let i = 0; i < n; i++) { const ff = f * 2 ** (detuneCents(i / SR) / 1200); ph += ff * size / SR; if (ph >= size) ph -= size * Math.floor(ph / size); const k = Math.floor(ph), fr = ph - k; y[i] = tab[k] * (1 - fr) + tab[k + 1] * fr }
  return y
}

/** Warm pad: three detuned saw voices per note, rolled off above `warm` Hz; stereo [L,R]. */
export function pad(freqs, dur, vel = 0.5, r, { att = 0.6, rel = 0.9, warm = 900, detune = 7 } = {}) {
  const n = ns(dur + rel), e = env(n, att, ns(dur), rel), out = stereo(n)
  for (const f of freqs) {
    const tab = table(Math.max(1, Math.min(30, Math.floor(4000 / f))), (k) => (1 / k) / (1 + (k * f / warm) ** 2))
    for (const [dc, p] of [[-detune, -0.6], [0, 0], [detune, 0.6]]) {
      const rate = r.u(0.15, 0.4), off = r() * TAU, y = osc(tab, f, n, (t) => dc + 3 * Math.sin(TAU * rate * t + off), r())
      const th = (p + 1) * Math.PI / 4, gl = Math.cos(th), gr = Math.sin(th)
      for (let i = 0; i < n; i++) { out[0][i] += y[i] * gl; out[1][i] += y[i] * gr }
    }
  }
  const g = vel / Math.sqrt(freqs.length * 3); for (let i = 0; i < n; i++) { out[0][i] *= e[i] * g; out[1][i] *= e[i] * g }
  return out
}
/** Plucked string (pizzicato / harp-ish): partials with frequency-dependent decay. */
export function pluck(f, vel = 0.7, r, dur = 0.9, bright = 0.5, pos = 0.17) {
  const K = Math.max(1, Math.min(24, Math.floor(9000 / f))), modes = []
  for (let k = 1; k <= K; k++) { const a = Math.abs(Math.sin(Math.PI * k * pos)) / k ** (1.6 - bright * 0.8); modes.push([f * k * (1 + 0.0004 * k * k), a, dur / (1 + 0.35 * k * (1 - bright * 0.5))]) }
  const x = modal(dur * 1.5, modes, r); const c = hp(noise(ns(0.006), r), 2000); for (let i = 0; i < c.length; i++) x[i] += c[i] * 0.25 * (1 - i / c.length)
  return fades(scaleBy(x, vel * 0.5), 0.001, 0.05)
}
/** Glockenspiel bar. */
export const glock = (f, vel = 0.7, r, dur = 1.8) => fades(scaleBy(addClick(modal(dur, [[f, 1, dur * 0.55], [f * 2.76, 0.35, dur * 0.18], [f * 5.4, 0.15, dur * 0.07], [f * 8.93, 0.06, dur * 0.03]], r), r, 0.08), vel * 0.5), 0.001, 0.05)
/** Vibraphone bar with motor tremolo. */
export function vibes(f, vel = 0.6, r, dur = 1.6, trem = 5.2, depth = 0.25) {
  const x = modal(dur, [[f, 1, dur * 0.6], [f * 4, 0.25, dur * 0.12], [f * 10, 0.05, dur * 0.04]], r); for (let i = 0; i < x.length; i++) x[i] *= 1 - depth * (0.5 + 0.5 * Math.sin(TAU * trem * i / SR))
  return fades(scaleBy(x, vel * 0.5), 0.002, 0.05)
}
/** Music-box tine (cantilever partials 1 : 6.27 : 17.55) with a tiny pluck click. */
export const musicbox = (f, vel = 0.6, r, dur = 1.6) => fades(scaleBy(addClick(modal(dur, [[f, 1, dur * 0.45], [f * 6.27, 0.3, dur * 0.08], [f * 17.55, 0.08, dur * 0.02]], r), r, 0.12), vel * 0.5), 0.001, 0.05)
/** Bell / chime (for dings). */
export const bell = (f, vel = 0.6, r, dur = 2) => fades(scaleBy(modal(dur, [[f, 1, dur * 0.5], [f * 2.4, 0.5, dur * 0.25], [f * 3.9, 0.3, dur * 0.12], [f * 5.4, 0.15, dur * 0.06]], r), vel * 0.45), 0.001, 0.05)
/** Timpani: tuned membrane modes + a soft mallet thump. */
export function timpani(f, vel = 0.8, r, dur = 2.2) {
  const x = modal(dur, [[f, 1, dur * 0.45], [f * 1.5, 0.5, dur * 0.3], [f * 1.98, 0.35, dur * 0.2], [f * 2.44, 0.2, dur * 0.12]], r, 0.02)
  const th = lp(noise(ns(0.15), r, 'pink'), 300); for (let i = 0; i < th.length; i++) x[i] += th[i] * 2.5 * Math.exp(-i / (SR * 0.03))
  return fades(scaleBy(x, vel * 0.55), 0.001, 0.08)
}
/** Snare (buzz = brushier, for rolls). */
export function snare(vel = 0.8, r, dur = 0.3, buzz = false) {
  const n = ns(dur), wires = bp(noise(n, r), 1800, 9000), x = new Float32Array(n)
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] = wires[i] * Math.exp(-t / (buzz ? 0.06 : 0.11)) * 0.9 + Math.sin(TAU * 185 * t) * Math.exp(-t / 0.04) * 0.6 + Math.sin(TAU * 330 * t) * Math.exp(-t / 0.025) * 0.3 }
  return fades(scaleBy(x, vel * 0.6), 0.0005, 0.03)
}
/** Roll strokes from t0 to t1 with velocity v0 -> v1: [[t, vel], ...]. */
export function snareRoll(t0, t1, v0, v1, r, rate = 26) { const out = []; for (let t = t0; t < t1; t += (1 / rate) * r.u(0.92, 1.08)) out.push([t, v0 + (v1 - v0) * (t - t0) / (t1 - t0)]); return out }
/** Clash / suspended cymbal: dense inharmonic partials + hiss, highs fade first. */
export function cymbal(vel = 0.7, r, dur = 2.4, bright = 1) {
  const n = ns(dur), modes = []; for (let k = 0; k < 40; k++) modes.push([r.u(320, 9000 * bright), r.u(0.2, 1), dur * r.u(0.15, 0.5)])
  const x = modal(dur, modes, r), h = hp(noise(n, r), 5000); for (let i = 0; i < n; i++) x[i] = x[i] * 0.05 + h[i] * 0.5 * Math.exp(-i / (SR * dur * 0.3))
  return fades(scaleBy(x, vel * 0.7), 0.002, 0.2)
}
/** Brass note: harmonics get brighter with velocity, a lip scoop on the attack. kind: horn | stab | soft | tuba */
export function brass(f, dur, vel = 0.8, r, kind = 'horn') {
  const att = { tuba: 0.035, horn: 0.03, stab: 0.012, soft: 0.1 }[kind], rel = kind === 'stab' ? 0.15 : 0.08, n = ns(dur + rel), e = env(n, att, ns(dur), rel), x = new Float32Array(n)
  const K = Math.max(1, Math.min(16, Math.floor(6000 / f))), tilt = 2.2 - vel * 1.1 - (kind === 'stab' ? 0.3 : 0) + (kind === 'soft' ? 0.6 : 0)
  for (let k = 1; k <= K; k++) { const a = 1 / k ** tilt; let ph = r() * TAU
    for (let i = 0; i < n; i++) { const t = i / SR, sc = 1 - 0.03 * Math.exp(-t / 0.04), bright = 1 + (kind === 'stab' ? 0.8 : 0.3) * Math.exp(-t / 0.08) * (k > 3 ? 1 : 0); ph += TAU * f * k * sc / SR; x[i] += a * bright * Math.sin(ph) } }
  for (let i = 0; i < n; i++) x[i] *= e[i] * (1 + 0.04 * Math.sin(TAU * 5 * i / SR) * Math.min(1, i / SR / 0.3))
  return fades(scaleBy(lp(x, 3500), vel * 0.35), 0.002, 0.05)
}
function scaleBy(x, g) { for (let i = 0; i < x.length; i++) x[i] *= g; return x }
function addClick(x, r, a) { const c = hp(noise(ns(0.004), r), 3000); for (let i = 0; i < c.length; i++) x[i] += c[i] * a; return x }

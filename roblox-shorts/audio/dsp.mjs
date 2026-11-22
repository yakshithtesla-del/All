// Small DSP kit in plain JS (no dependencies): seeded noise, RBJ biquads (fixed and swept), envelopes, stereo
// placement, a Freeverb-style reverb, BS.1770 loudness (integrated / momentary max), a look-ahead limiter, WAV out.
// Ported in spirit from the claude-animated-shorts audio kit (dsp.py, MIT, used with the author's permission).
export const SR = 48000
export const TAU = Math.PI * 2
export const ns = (t) => Math.max(0, Math.round(t * SR))
export const dbg = (db) => 10 ** (db / 20)
export const m2f = (m) => 440 * 2 ** ((m - 69) / 12)

/** Seeded random: r() in [0,1), r.u(a,b), r.n() normal, r.i(n) int, r.fork() a new independent stream. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  r.u = (a, b) => a + (b - a) * r()
  r.n = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(TAU * r())
  r.i = (n) => Math.floor(r() * n)
  r.fork = () => rng(Math.floor(r() * 2 ** 31))
  return r
}

// ---------------------------------------------------------------- noise
/** color: 'white' | 'pink' | 'brown' */
export function noise(n, r, color = 'white') {
  const x = new Float32Array(n)
  if (color === 'white') for (let i = 0; i < n; i++) x[i] = r() * 2 - 1
  else if (color === 'pink') { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < n; i++) { const w = r() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926 } }
  else { let y = 0; for (let i = 0; i < n; i++) { y = 0.997 * y + (r() * 2 - 1) * 0.06; x[i] = y } }
  return x
}
/** Slow random wobble in [-1,1] at about `rate` Hz (for natural variation). */
export function wobble(n, r, rate) {
  const step = Math.max(1, Math.round(SR / Math.max(rate, 0.01))), pts = Math.ceil(n / step) + 2, v = Array.from({ length: pts }, () => r() * 2 - 1), x = new Float32Array(n)
  for (let i = 0; i < n; i++) { const k = i / step, a = Math.floor(k), f = k - a, s = (1 - Math.cos(f * Math.PI)) / 2; x[i] = v[a] * (1 - s) + v[a + 1] * s }
  return x
}

// ---------------------------------------------------------------- filters (RBJ cookbook)
function coef(type, f, q = 0.707, gain = 0) {
  const w = TAU * Math.min(f, SR * 0.49) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q), A = 10 ** (gain / 40)
  let b0, b1, b2, a0, a1, a2
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a }
  else if (type === 'bp') { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a }
  else if (type === 'peak') { b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * c; a2 = 1 - a / A }
  else if (type === 'hs') { const sq = 2 * Math.sqrt(A) * a; b0 = A * ((A + 1) + (A - 1) * c + sq); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - sq); a0 = (A + 1) - (A - 1) * c + sq; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - sq }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]
}
/** Filter a mono signal (returns a new array). order 2 = one biquad, 4 = two. */
export function filt(x, type, f, q = 0.707, gain = 0, order = 2) {
  let y = Float32Array.from(x)
  for (let o = 0; o < Math.max(1, order / 2); o++) {
    const [b0, b1, b2, a1, a2] = coef(type, f, q, gain); let x1 = 0, x2 = 0, y1 = 0, y2 = 0
    for (let i = 0; i < y.length; i++) { const v = y[i], o2 = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = o2; y[i] = o2 }
  }
  return y
}
export const lp = (x, f, order = 2) => filt(x, 'lp', f, 0.707, 0, order)
export const hp = (x, f, order = 2) => filt(x, 'hp', f, 0.707, 0, order)
export const bp = (x, lo, hi) => filt(filt(x, 'hp', lo), 'lp', hi)
export const reson = (x, f, q) => filt(x, 'bp', f, q)
/** Band-pass whose centre follows fc(t) (t in seconds within x); coefficients refreshed every 32 samples. */
export function sweep(x, fc, q = 1.2) {
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0, c = null
  for (let i = 0; i < x.length; i++) {
    if (i % 32 === 0) c = coef('bp', Math.max(30, fc(i / SR)), q)
    const v = x[i], o = c[0] * v + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o
  }
  return y
}

// ---------------------------------------------------------------- envelopes and shaping
export function fades(x, fin = 0.003, fout = 0.01) {
  const chans = Array.isArray(x) ? x : [x]
  for (const c of chans) { const a = Math.min(c.length, ns(fin)), b = Math.min(c.length, ns(fout)); for (let i = 0; i < a; i++) c[i] *= i / a; for (let i = 0; i < b; i++) c[c.length - 1 - i] *= i / b }
  return x
}
/** Multiply by an envelope function e(t). */
export function shape(x, e) { for (let i = 0; i < x.length; i++) x[i] *= e(i / SR); return x }
export const decay = (tau) => (t) => Math.exp(-t / tau)
/** Sum of decaying sines: modes = [[freq, amp, tau], ...]. */
export function modal(dur, modes, r, glide = 0) {
  const n = ns(dur), x = new Float32Array(n)
  for (const [f, a, tau] of modes) { let ph = r ? r() * TAU : 0
    for (let i = 0; i < n; i++) { const t = i / SR, ff = f * (1 + glide * Math.exp(-t / 0.02)); ph += TAU * ff / SR; x[i] += a * Math.sin(ph) * Math.exp(-t / tau) } }
  return x
}
/** Sine whose frequency follows f(t). */
export function chirp(dur, f, amp = (t) => 1) { const n = ns(dur), x = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * f(t) / SR; x[i] = Math.sin(ph) * amp(t) } return x }

// ---------------------------------------------------------------- stereo
/** Constant-power pan of a mono signal -> [L, R]. Stereo input passes through. */
export function pan(x, p = 0) {
  if (Array.isArray(x)) return x
  const th = (p + 1) * Math.PI / 4, gl = Math.cos(th) * Math.SQRT2, gr = Math.sin(th) * Math.SQRT2
  return [x.map((v) => v * gl), x.map((v) => v * gr)]
}
export const stereo = (n) => [new Float32Array(n), new Float32Array(n)]
/** Add x (mono or [L,R]) into buf [L,R] at time t (s), times gain. */
export function place(buf, x, t, gain = 1) {
  const [l, r] = Array.isArray(x) ? x : [x, x], i0 = ns(t), n = buf[0].length
  for (let i = 0; i < l.length; i++) { const k = i0 + i; if (k < 0) continue; if (k >= n) break; buf[0][k] += l[i] * gain; buf[1][k] += r[i] * gain }
}
/** Light stereo widening of a mono signal (short complementary delays). */
export function widen(x, ms = 11, amount = 0.5) {
  const d = ns(ms / 1000), l = new Float32Array(x.length), r = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) { const dl = i >= d ? x[i - d] : 0; l[i] = x[i] + amount * dl; r[i] = x[i] - amount * dl }
  return [l, r]
}
export const scale = (x, g) => { for (const c of Array.isArray(x) ? x : [x]) for (let i = 0; i < c.length; i++) c[i] *= g; return x }

// ---------------------------------------------------------------- reverb (Freeverb: 8 combs + 4 allpasses per side)
export function reverb(mono, { room = 0.82, damp = 0.35, spread = 23 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225], k = SR / 44100, out = stereo(mono.length)
  for (let side = 0; side < 2; side++) {
    const y = out[side], add = side * spread
    for (const L of combs) { const len = Math.round((L + add) * k), buf = new Float32Array(len); let idx = 0, store = 0
      for (let i = 0; i < mono.length; i++) { const o = buf[idx]; store = o * (1 - damp) + store * damp; buf[idx] = mono[i] * 0.015 + store * room; y[i] += o; idx = (idx + 1) % len } }
    for (const L of aps) { const len = Math.round((L + add) * k), buf = new Float32Array(len); let idx = 0
      for (let i = 0; i < y.length; i++) { const b = buf[idx], v = y[i]; y[i] = -v + b; buf[idx] = v + b * 0.5; idx = (idx + 1) % len } }
  }
  return out
}

// ---------------------------------------------------------------- loudness (ITU-R BS.1770)
function kweight(x) { return filt(filt(x, 'hs', 1681.97, 0.7072, 4.0), 'hp', 38.13, 0.5003) }
function blocks(ch, win = 0.4, hop = 0.1) {
  const k = ch.map(kweight), W = ns(win), H = ns(hop), out = []
  for (let a = 0; a + W <= k[0].length; a += H) { let s = 0; for (const c of k) for (let i = a; i < a + W; i++) s += c[i] * c[i]; out.push(s / W) }
  return out
}
const lk = (ms) => -0.691 + 10 * Math.log10(ms + 1e-20)
/** Integrated loudness (LUFS) of [L,R] or mono. */
export function integrated(x) {
  const ch = Array.isArray(x) ? x : [x]; if (ch[0].length < ns(0.4)) return -Infinity
  const b = blocks(ch).filter((m) => lk(m) > -70); if (!b.length) return -Infinity
  const rel = lk(b.reduce((a, v) => a + v, 0) / b.length) - 10, g = b.filter((m) => lk(m) > rel)
  return g.length ? lk(g.reduce((a, v) => a + v, 0) / g.length) : -Infinity
}
/** Loudest 400 ms window (LUFS): the level of a short event. Short sounds are padded to one window. */
export function momentaryMax(x) {
  let ch = Array.isArray(x) ? x : [x]
  if (ch[0].length < ns(0.45)) ch = ch.map((c) => { const p = new Float32Array(ns(0.45)); p.set(c); return p })
  const b = blocks(ch, 0.4, 0.05); return b.length ? lk(Math.max(...b)) : -Infinity
}

// ---------------------------------------------------------------- limiter + output
/** Look-ahead peak limiter: ceiling in dBFS; peaks checked at 2x (linear interpolation) for inter-sample overs. */
export function limit([l, r], ceilDb = -1.2, look = 0.003, rel = 0.08) {
  const c = dbg(ceilDb), n = l.length, gr = new Float32Array(n)
  for (let i = 0; i < n; i++) { const pl = Math.max(Math.abs(l[i]), Math.abs(r[i])), ip = i + 1 < n ? Math.max(Math.abs((l[i] + l[i + 1]) / 2), Math.abs((r[i] + r[i + 1]) / 2)) : 0; gr[i] = Math.min(1, c / Math.max(pl, ip, 1e-9)) }
  const La = ns(look), g = new Float32Array(n), kr = 1 - Math.exp(-1 / (rel * SR)); let cur = 1
  const mins = new Float32Array(n); // min over a look-ahead window
  for (let i = 0; i < n; i++) { let m = 1; for (let j = i; j < Math.min(n, i + La); j++) if (gr[j] < m) m = gr[j]; mins[i] = m }
  for (let i = 0; i < n; i++) { cur = Math.min(mins[i], cur + (1 - cur) * kr); g[i] = cur }
  for (let i = 0; i < n; i++) { l[i] *= g[i]; r[i] *= g[i] }
  return [l, r]
}
/** 32-bit float stereo WAV. */
export function wav([l, r]) {
  const n = l.length, buf = Buffer.alloc(44 + n * 8)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22)
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34); buf.write('data', 36); buf.writeUInt32LE(n * 8, 40)
  for (let i = 0; i < n; i++) { buf.writeFloatLE(l[i], 44 + i * 8); buf.writeFloatLE(r[i], 48 + i * 8) }
  return buf
}

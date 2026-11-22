// node mouth.mjs   (in the video project, after the voice is made)
// Writes voice/mouth.json from voice/voice.mp3: for every video frame, how open the mouth is (loudness) and whether the
// sound is bright ("ee": wide) or dark ("oo": round). No AI model. Scenes read it with loadMouth() / mouthAt().
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { ffmpegPath } from './lib/ffmpeg.mjs'
const FF = await ffmpegPath().catch(() => 'ffmpeg')   // the computer's ffmpeg, else the bundled copy (node setup.mjs)

const PROJECT = process.cwd()
const vdir = path.join(PROJECT, 'voice')
const mp3 = path.join(vdir, 'voice.mp3')
if (!fs.existsSync(mp3)) { console.error('NO_VOICE: voice/voice.mp3 is missing. Make the voice first.'); process.exit(1) }
const story = fs.existsSync(path.join(PROJECT, 'story.json')) ? JSON.parse(fs.readFileSync(path.join(PROJECT, 'story.json'), 'utf8')) : {}
const fps = story.fps ?? 30

/** One second-order filter pass ('lp' or 'hp') over samples x at sample rate sr. */
function biquad(x, type, f, sr, q = 0.707) {
  const w = (2 * Math.PI * f) / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al
  const b = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2], a1 = -2 * c, a2 = 1 - al
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) { const v = x[i], o = (b[0] * v + b[1] * x1 + b[2] * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o }
  return y
}

const SR = 16000
const r = spawnSync(FF, ['-v', 'error', '-i', mp3, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 })
if (r.status !== 0) { console.error('FAIL: could not read voice/voice.mp3 with ffmpeg.'); process.exit(1) }
const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4))
const low = biquad(biquad(x, 'hp', 200, SR), 'lp', 900, SR), high = biquad(biquad(x, 'hp', 2200, SR), 'lp', 5500, SR)
const hop = SR / fps, n = Math.ceil(x.length / hop), rms = [], lo = [], hi = []
for (let f = 0; f < n; f++) {
  let a = 0, b = 0, c = 0; const s = Math.floor(f * hop), e = Math.min(x.length, Math.floor(s + hop * 1.5))
  for (let i = s; i < e; i++) { a += x[i] * x[i]; b += low[i] * low[i]; c += high[i] * high[i] }
  const m = Math.max(1, e - s); rms.push(Math.sqrt(a / m)); lo.push(Math.sqrt(b / m)); hi.push(Math.sqrt(c / m))
}
const sorted = [...rms].sort((p, q) => p - q), top = sorted[Math.floor(sorted.length * 0.97)] || 1, floor = sorted[Math.floor(sorted.length * 0.3)] * 1.5
const frames = [], r2 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100; let jaw = 0
for (let f = 0; f < n; f++) {
  const v = Math.max(0, (rms[f] - floor) / Math.max(1e-6, top - floor)), target = Math.min(1, v ** 0.8)
  jaw += (target - jaw) * (target > jaw ? 0.7 : 0.45)
  const bright = hi[f] / Math.max(1e-6, lo[f] + hi[f]), round = jaw * Math.max(0, 0.5 - bright) * 1.4
  frames.push(jaw > 0.06 ? [r2(jaw * 0.88 + jaw * (1 - bright) * 0.45 + round * 0.3 + Math.min(1, v) * 0.55), r2(Math.min(1, bright * 1.6) * jaw), r2(round)] : [0, 0, 0])
}
fs.writeFileSync(path.join(vdir, 'mouth.json'), JSON.stringify({ fps, frames }))
console.log(`Done: voice/mouth.json (${frames.length} frames, lip-sync).`)

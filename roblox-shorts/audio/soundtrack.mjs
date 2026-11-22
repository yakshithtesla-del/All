// The video's whole soundtrack, made in code: an original score in the story's mood that follows the beats, room
// beds, a whoosh on every scene change, the SFX each beat asks for, mixed under the voice -> out/mix.wav.
// Method and levels from the claude-animated-shorts audio kit (MIT, used with the author's permission):
// music ~10 LU under the voice with a 3 dB dip keyed on the spoken words, every SFX event 6 dB under its natural
// level, beds 26-32 LU under, an optional dead stop before the climax, master -15 LUFS with a look-ahead limiter.
//
// story.json:
//   "sound": { "mood": "tense", "bed": "room", "stop": 4, "music": -10 }
//     SFX and room tone are always made. "music": false = no music (the person turned it off); a story.music file the
//     person owns replaces the made score (looped, same level and dip).
//     mood: tense | mystery | curious | upbeat | playful | warm | epic | sad   (default curious)
//     bed:  room | office | city | nature | night | ocean | rain | space | none   (any beat can override with "bed")
//     stop: a beat index: the music goes silent from just before that beat's line until the next beat (the climax)
//     music: music level in LU under the voice (default -10; -12 calmer, -8 more present), or false for no music
//   beat "sfx": [{ "sound": "pop", "at": "word" }, { "sound": "boom", "at": 1.2, "gain": 3 }]   at = a word of the
//     beat's line (its start) or seconds from the beat start. Sounds: see SFX in sfx.mjs.
//   beat "hit": "word"   a stab + timpani on that word (the line's key word)
//   beat "music": soft | low | full | build | stop   direct the score for that beat (dramas): soft = pad only, low = pulse +
//     theme, full = everything, build = a roll and swell into the next beat, stop = silence for the whole beat
// Run: node audio/soundtrack.mjs  (render.mjs video runs it for you)
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SR, ns, dbg, m2f, rng, stereo, place, pan, scale, reverb, hp, integrated, momentaryMax, limit, wav, fades } from './dsp.mjs'
import * as I from './instruments.mjs'
import { SFX, BEDS, whoosh } from './sfx.mjs'
import { ffmpegPath } from '../lib/ffmpeg.mjs'
const FF = await ffmpegPath().catch(() => 'ffmpeg')   // the computer's ffmpeg, else the bundled copy (node setup.mjs)

const MOODS = { // prog = 8 bars: the second half travels somewhere else before coming home
  tense: { key: 50, minor: true, bpm: 90, prog: ['i', 'VI', 'iv', 'V', 'i', 'III', 'VI', 'V'], lead: 'pluckHi', perc: 'timpani', warm: 700 },
  mystery: { key: 52, minor: true, bpm: 80, prog: ['i', 'iv', 'VI', 'V', 'iv', 'i', 'VII', 'V'], lead: 'musicbox', perc: null, warm: 650 },
  curious: { key: 55, minor: false, bpm: 100, prog: ['I', 'vi', 'IV', 'V', 'I', 'iii', 'IV', 'V'], lead: 'glock', perc: 'snare', warm: 900 },
  upbeat: { key: 60, minor: false, bpm: 118, prog: ['I', 'V', 'vi', 'IV', 'I', 'V', 'IV', 'V'], lead: 'glock', perc: 'snare', warm: 1300 },
  playful: { key: 62, minor: false, bpm: 120, prog: ['I', 'IV', 'V', 'I', 'vi', 'IV', 'ii', 'V'], lead: 'musicbox', perc: 'snare', warm: 1100 },
  warm: { key: 53, minor: false, bpm: 84, prog: ['I', 'vi', 'IV', 'V', 'I', 'iii', 'IV', 'I'], lead: 'vibes', perc: null, warm: 900 },
  epic: { key: 50, minor: true, bpm: 96, prog: ['i', 'VI', 'III', 'VII', 'i', 'iv', 'VI', 'V'], lead: 'brass', perc: 'timpani', warm: 1200 },
  sad: { key: 57, minor: true, bpm: 72, prog: ['i', 'VI', 'III', 'VII', 'iv', 'i', 'VI', 'V'], lead: 'musicbox', perc: null, warm: 600 },
}
const DEG = { I: [0, 0], ii: [2, 1], iii: [4, 1], IV: [5, 0], V: [7, 0], vi: [9, 1], i: [0, 1], III: [3, 0], iv: [5, 1], VI: [8, 0], VII: [10, 0] }
const chord = (key, d) => { const [o, minor] = DEG[d], root = key - 12 + o; return [root, root + (minor ? 3 : 4), root + 7, root + 12] }
const scaleOf = (key, minor) => (minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map((s) => key + 12 + s)

/** Beat times, as the engine computes them (voice timing when there is a voice, else beat.seconds). */
export function beatTimes(story, timing) {
  let cur = 0
  const beats = story.beats.map((b, i) => { const L = timing?.lines?.[i]; let start, dur
    if (L) { start = L.start; const nx = timing.lines[i + 1]; dur = (nx ? nx.start : timing.duration) - start } else { start = cur; dur = b.seconds ?? 2.5 }
    cur = start + dur; return { ...b, index: i, start, dur, words: L?.words ?? [], speechAt: L?.speechStart ?? b.speechAt ?? (L ? L.words?.[0]?.start ?? start : start) } })
  return { beats, DUR: cur }
}
const wordAt = (b, w) => { const k = String(w).toLowerCase().replace(/[^a-z0-9']/g, ''); const hit = b.words.find((x) => x.word.toLowerCase().replace(/[^a-z0-9']/g, '').startsWith(k)); return hit ? hit.start : null }
const when = (b, at) => (typeof at === 'number' ? b.start + at : wordAt(b, at) ?? b.speechAt)

// A two-bar theme: [eighth slot 0..15, length in eighths, scale step relative to the chord root]. Made once per video,
// then fitted to each chord and varied when it comes back, so the music develops instead of looping.
function makeTheme(r) {
  const rhythms = [[0, 2, 4, 6, 8, 12], [0, 3, 4, 6, 8, 10, 12], [0, 2, 3, 4, 8, 11, 12], [0, 4, 6, 8, 10, 12, 14]], rh = rhythms[r.i(rhythms.length)]
  let step = [0, 2, 4][r.i(3)]; const out = []
  rh.forEach((slot, k) => { const nx = rh[k + 1] ?? 16; out.push([slot, nx - slot, step]); step += [-2, -1, 1, 2, 1, -1][r.i(6)]; step = Math.max(-2, Math.min(7, step)) })
  out[out.length - 1][2] = [0, 2, 4][r.i(3)]; return out
}
const stepNote = (sc, root, st) => { const deg = sc.findIndex((m) => (m - root) % 12 === 0); const i = (deg < 0 ? 0 : deg) + st, o = Math.floor(i / 7); return sc[((i % 7) + 7) % 7] + 12 * o }

function score(story, beats, DUR, r) {
  const S = story.sound ?? {}, M = MOODS[S.mood] ?? MOODS.curious, BEAT = 60 / (S.bpm ?? M.bpm), BAR = 4 * BEAT, E8 = BEAT / 2, N = ns(DUR + 3)
  const tr = {}, add = (k, x, t, p = 0) => { tr[k] ??= stereo(N); place(tr[k], pan(x, p), t) }
  const nb = Math.ceil(DUR / BAR), sc = scaleOf(M.key, M.minor), theme = makeTheme(r)
  // energy per bar from the story: intro on the first beat, rising through the middle, a build into the last beat
  // (or into the climax), an outro on the last beat. 0 intro | 1 verse | 2 lift | 3 build | 4 outro
  const lastStart = beats.at(-1).start, climax = Number.isInteger(S.stop) && beats[S.stop] ? beats[S.stop].start : null
  const PH = { soft: 0, low: 1, full: 2, build: 3 }
  const energy = (t0) => { const t = t0 + BAR / 2, bt = beats.find((b) => t >= b.start && t < b.start + b.dur)
    if (bt?.music && PH[bt.music] != null) return PH[bt.music]
    if (t >= lastStart) return 4
    if ((climax != null && t0 < climax && t0 + BAR >= climax - 0.01) || (t0 < lastStart && t0 + BAR >= lastStart - 0.01)) return 3
    if (t < beats[0].start + beats[0].dur) return 0
    return t < (beats[0].start + beats[0].dur + lastStart) / 2 ? 1 : 2 }
  let themeBar = 0
  for (let b = 0; b < nb; b++) {
    const t0 = b * BAR, E = energy(t0), deg = M.prog[b % M.prog.length], c = chord(M.key, deg), root = c[0] + 12, last = t0 + BAR >= DUR - 0.05
    add('pad', I.pad(c.map(m2f), Math.min(BAR, DUR - t0) + 0.25, E === 0 ? 0.45 : 0.55, r, { att: b ? 0.25 : 0.8, rel: last ? 2.5 : 0.8, warm: M.warm * (E >= 2 ? 1.3 : 1) }), t0)
    // bass pulse: quarters in the intro/outro, eighths in the verse, a syncopated figure in the lift and build
    const pat = E === 0 || E === 4 ? [0, 2, 4, 6] : E === 1 ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1.5, 3, 4, 5.5, 6, 7]
    if (!(E === 0 && b === 0)) for (const k of pat) { const t = t0 + k * E8; if (t > DUR - 0.3) break; add('pulse', I.pluck(m2f(c[0] - 12 + (k === 3 || k === 7 ? 7 : k === 5.5 ? 12 : 0)), Number.isInteger(k) && k % 2 === 0 ? 0.55 : 0.4, r, 0.45, 0.35), t, -0.15) }
    // the theme: from the verse on, fitted to the chord; it comes back varied (higher, an answer, broken up), slowed in the outro
    if (E >= 1 && !last) {
      const half = themeBar % 2, v = Math.floor(themeBar / 2) % 3, lift = v === 1 ? 2 : 0
      for (const [slot, len, st] of theme) { if ((slot >= 8) !== !!half) continue
        if (v === 2 && slot % 4 === 2) continue // the third pass leaves gaps: an echo of the theme
        const stretch = E === 4 ? 2 : 1, t = t0 + (slot - half * 8) * E8 * stretch; if (t > Math.min(DUR - 0.5, t0 + BAR - 0.05)) continue
        const m = stepNote(sc, root, st + lift + (half && v === 0 && slot >= 14 ? 0 : 0)), f = m2f(m + (M.lead === 'brass' ? 0 : 12))
        if (M.lead === 'brass') add('lead', I.brass(f / 2, len * E8 * 0.9, 0.7, r, 'horn'), t, -0.1)
        else if (M.lead === 'pluckHi') add('lead', I.pluck(f, 0.6, r, 0.8, 0.6), t, 0.2)
        else add('lead', I[M.lead](f, 0.5, r, 1.2), t, 0.2)
        if (E >= 2 && M.lead !== 'glock') add('counter', I.glock(m2f(m + 24), 0.25, r, 0.9), t + E8, 0.35) // a light echo above
      }
      themeBar++
    }
    // percussion grows with the energy; the build rolls into the next section with a cymbal swell
    if (M.perc === 'snare' && E >= 2 && E < 4) for (const k of [1, 3]) add('perc', I.snare(0.32, r, 0.2), t0 + k * BEAT, 0.1)
    if (M.perc === 'timpani' && E >= 1 && E < 4 && b % 2 === 0) add('perc', I.timpani(m2f(c[0] - 12), 0.45 + 0.1 * E, r, 1.6), t0)
    if (E === 3) { for (const [t, v] of I.snareRoll(t0 + BAR / 2, t0 + BAR - 0.04, 0.1, 0.7, r)) add('perc', I.snare(v, r, 0.18, true), t, 0.1)
      for (let k = 0; k < 10; k++) add('cym', I.cymbal(0.04 + k * 0.03, r, 0.5, 0.6), t0 + BAR / 2 + k * BAR / 20, 0.2) }
    if (b > 0 && E !== energy(t0 - BAR) && E !== 3) add('cym', I.cymbal(0.4, r, 2, 0.8), t0, -0.2) // a crash when a new section starts
  }
  // the hook lands: timpani + soft cymbal on the first frame; any "hit" word gets a stab + timpani
  add('perc', I.timpani(m2f(M.key - 24), 0.9, r), 0); add('cym', I.cymbal(0.35, r, 2, 0.7), 0, 0.2)
  for (const b of beats) if (b.hit) { const t = when(b, b.hit), c = chord(M.key, M.prog[Math.floor(t / BAR) % M.prog.length]); for (const m of c) add('stab', M.lead === 'brass' || M.minor ? I.brass(m2f(m), 0.7, 0.85, r, 'stab') : I.bell(m2f(m + 12), 0.5, r, 1.4), t - 0.02); add('perc', I.timpani(m2f(c[0] - 12), 0.95, r), t - 0.02) }
  // a final ringing tonic
  const fin = Math.max(0, DUR - 2.4), tc = chord(M.key, M.prog[0]); for (const m of tc) add('end', M.lead === 'vibes' || M.lead === 'pluckHi' ? I.vibes(m2f(m + 12), 0.4, r, 2.5) : I.bell(m2f(m + 12), 0.35, r, 2.5), fin, 0.1)
  // balance inside the band (LU), then a hall
  const BAL = { pad: -3, pulse: -7, perc: -6, cym: -13, lead: -4, counter: -11, stab: -2, end: -4 }, out = stereo(N), send = new Float32Array(N)
  for (const [k, x] of Object.entries(tr)) { const L = integrated(x); if (!isFinite(L)) continue; const g = dbg(-20 + (BAL[k] ?? -6) - L)
    for (let i = 0; i < N; i++) { out[0][i] += x[0][i] * g; out[1][i] += x[1][i] * g; send[i] += 0.25 * g * (x[0][i] + x[1][i]) / 2 } }
  const wet = reverb(send, { room: 0.84, damp: 0.4 }); for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) out[c][i] += wet[c][i] * 0.6
  // beats marked "stop": the music drops out for the whole beat (the hit on the next beat brings it back)
  for (const b of beats) if (b.music === 'stop') { const a = ns(b.start - 0.05), e = ns(b.start + b.dur - 0.05)
    for (let c = 0; c < 2; c++) for (let i = Math.max(0, a); i < Math.min(N, e); i++) out[c][i] *= Math.min(1, Math.max(0, (a + ns(0.06) - i) / ns(0.06)), Math.max(0, (i - e + ns(0.04)) / ns(0.04))) }
  // dead stop: silent from just before the climax line until the next beat
  if (Number.isInteger(S.stop) && beats[S.stop]) { const b = beats[S.stop], a = ns(Math.max(b.start, b.speechAt - 0.05)), e = ns(b.start + b.dur)
    for (let c = 0; c < 2; c++) for (let i = a; i < Math.min(N, e); i++) out[c][i] *= Math.min(1, Math.max(0, (a + ns(0.03) - i) / ns(0.03)), Math.max(0, (i - e + ns(0.04)) / ns(0.04))) }
  return out.map((c) => hp(c, 30))
}

function loadVoice(ROOT, N) {
  const f = path.join(ROOT, 'voice/voice.mp3'); if (!fs.existsSync(f)) return null
  const p = spawnSync(FF, ['-v', 'error', '-i', f, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 })
  if (p.status !== 0) return null
  const raw = new Float32Array(p.stdout.buffer, p.stdout.byteOffset, Math.floor(p.stdout.length / 4)), v = new Float32Array(N); v.set(raw.subarray(0, N)); return v
}
/** The dip under speech, keyed on the words (not the audio): -3 dB with a 70 ms attack and 450 ms release. */
function duck(beats, N, depth = -3) {
  const on = new Uint8Array(Math.ceil(N / 48) + 1)
  for (const b of beats) for (const w of b.words) for (let k = Math.floor((w.start - 0.08) * 1000); k < (w.end + 0.12) * 1000; k++) if (k >= 0 && k < on.length) on[k] = 1
  const g = new Float32Array(N); let e = 0; const ka = 1 - Math.exp(-1 / 70), kr = 1 - Math.exp(-1 / 450)
  for (let k = 0; k < on.length; k++) { e += (on[k] - e) * (on[k] > e ? ka : kr); const gg = dbg(depth * e); for (let i = k * 48; i < Math.min(N, (k + 1) * 48); i++) g[i] = gg }
  return g
}

function loadTrack(file, N) { // a music file the person owns, looped to the video's length, stereo
  const p = spawnSync(FF, ['-v', 'error', '-stream_loop', '-1', '-i', file, '-t', String(N / SR + 0.1), '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 })
  if (p.status !== 0) return null
  const raw = new Float32Array(p.stdout.buffer, p.stdout.byteOffset, Math.floor(p.stdout.length / 4)), out = stereo(N)
  for (let i = 0; i < N && 2 * i + 1 < raw.length; i++) { out[0][i] = raw[2 * i]; out[1][i] = raw[2 * i + 1] }
  return fades(out, 0.5, 2.0)
}

export async function soundtrack(ROOT, story) {
  const S = story.sound && typeof story.sound === 'object' ? story.sound : {}
  const musicOn = story.sound !== false && S.music !== false, own = story.music ? path.resolve(ROOT, story.music) : null
  const timing = fs.existsSync(path.join(ROOT, 'voice/timing.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'voice/timing.json'), 'utf8')) : null
  const { beats, DUR } = beatTimes(story, timing), N = ns(DUR), r = rng(story.title ? [...story.title].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) : 7)
  const voice0 = loadVoice(ROOT, N), voice = voice0 && isFinite(integrated([voice0, voice0])) ? voice0 : null, vRef = voice ? integrated([voice, voice]) : -16   // a silent voice track (no voiceover) = no voice
  // music
  const mus = !musicOn ? stereo(N) : own && fs.existsSync(own) ? (loadTrack(own, N) ?? stereo(N)) : score(story, beats, DUR, r.fork()).map((c) => c.subarray(0, N))
  const Lm = integrated(mus), mg = isFinite(Lm) ? dbg(vRef + (typeof S.music === 'number' ? S.music : voice ? -10 : 0) - Lm) : 0, dk = voice ? duck(beats, N) : null
  for (const c of mus) for (let i = 0; i < N; i++) c[i] *= mg * (dk ? dk[i] : 1)
  // beds per beat (merged while the same), then events
  const sfx = stereo(N), send = new Float32Array(N), rr = r.fork(), segs = []
  for (const b of beats) { const bed = b.bed ?? S.bed ?? 'room'; if (segs.length && segs.at(-1).bed === bed) segs.at(-1).end = b.start + b.dur; else segs.push({ bed, start: b.start, end: b.start + b.dur }) }
  for (const s of segs) { if (!BEDS[s.bed]) continue; const x = fades(BEDS[s.bed].make(s.end - s.start + 0.3, rr.fork()), 0.25, 0.3); scale(x, dbg(vRef + BEDS[s.bed].naive - integrated(x))); place(sfx, x, Math.max(0, s.start - 0.15)) }
  const event = (name, t, gain = 0, p = 0) => { const def = SFX[name]; if (!def || t == null) return; const x = pan(def.make(rr.fork()), p); scale(x, dbg(vRef + def.naive - 6 + gain - momentaryMax(x))); place(sfx, x, t); for (let i = 0; i < x[0].length; i++) { const k = ns(t) + i; if (k < N) send[k] += 0.12 * (x[0][i] + x[1][i]) / 2 } }
  beats.forEach((b, i) => { if (i && b.scene !== beats[i - 1].scene) { const x = whoosh(0.7, rr.fork(), 0.28), y = pan(x, 0); scale(y, dbg(vRef - 18 - momentaryMax(y))); place(sfx, y, b.start - 0.22) } })
  for (const b of beats) for (const e of b.sfx ?? []) event(e.sound, when(b, e.at ?? 0), e.gain ?? 0, e.pan ?? 0)
  const wet = reverb(send, { room: 0.6, damp: 0.5 }); for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) sfx[c][i] += wet[c][i] * 0.5
  // master: -15 LUFS, limiter at -1.2 dBFS (a second pass corrects what the limiter took)
  const mixd = stereo(N); for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) mixd[c][i] = (voice ? voice[i] : 0) + mus[c][i] + sfx[c][i]
  let G = -15 - integrated(mixd), y
  for (let k = 0; k < 2; k++) { y = mixd.map((c) => c.map((v) => v * dbg(G))); limit(y, -1.2); const L = integrated(y); if (Math.abs(L + 15) < 0.1) break; G += -15 - L }
  const fadeN = ns(0.6); for (const c of y) for (let i = 0; i < fadeN; i++) c[N - 1 - i] *= i / fadeN
  const out = path.join(ROOT, 'out/mix.wav'); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, wav(y))
  console.log(`soundtrack: ${!musicOn ? 'no music' : own ? 'own music' : (S.mood ?? 'curious') + ' score'}, ${segs.map((s) => s.bed).join('/')} bed, ${beats.reduce((a, b) => a + (b.sfx?.length ?? 0), 0)} sfx, ${integrated(y).toFixed(1)} LUFS -> out/mix.wav`)
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), story = JSON.parse(fs.readFileSync(path.join(ROOT, 'story.json'), 'utf8'))
  await soundtrack(ROOT, story)
}

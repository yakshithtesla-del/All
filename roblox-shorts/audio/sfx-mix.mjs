// Mixes the SFX plan (sfx-plan.mjs) onto the soundtrack, the owner's way:
//   - each sound's loudest moment lands exactly on its time, even when the file starts with a lead-in
//   - its level comes from its role, a fixed distance under the voice's peak: impact -1 dB, transition -7, soft -10,
//     kit -12, subtle -15 (plus the event's offset), so the narration always stays on top
//   - pitch changes keep the speed (rubberband when this ffmpeg has it; otherwise the sound plays unpitched)
//   - a limiter, then -14 LUFS (the loudness YouTube, TikTok and Reels play at)
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { ffmpegPath } from '../lib/ffmpeg.mjs'
const FF = await ffmpegPath().catch(() => 'ffmpeg')   // the computer's ffmpeg, else the bundled copy (node setup.mjs)

const ROLE_DB = { impact: -1, transition: -7, soft: -10, kit: -12, subtle: -15 }
const SR = 44100
function decode(file) {
  const r = spawnSync(FF, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 })
  if (r.status !== 0) throw new Error(`could not read ${path.basename(file)}`)
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4))
}
const db = (x) => 20 * Math.log10(x + 1e-9)
function peakOf(x) { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return m }
/** Where the sound is loudest (seconds): the strongest 256-sample window. */
function loudestAt(x) { const hop = 256; let best = 0, at = 0; for (let i = 0; i + hop <= x.length; i += hop) { let s = 0; for (let k = i; k < i + hop; k++) s += x[k] * x[k]; if (s > best) { best = s; at = i } } return at / SR }
let PITCH = null
const canPitch = () => (PITCH ??= (spawnSync(FF, ['-hide_banner', '-filters']).stdout?.toString() ?? '').includes('rubberband'))

/**
 * base: the soundtrack (voice + music) to mix onto. voiceFile: the narration, for the reference level (null = use the
 * base's own peak). plan: from planSfx(). Writes out to `outWav` and returns it.
 */
export function mixSfx(base, voiceFile, plan, outWav) {
  let ref = db(peakOf(decode(voiceFile ?? base))); if (!isFinite(ref) || ref < -60) ref = db(peakOf(decode(base)))   // no voiceover: level against the music
  const inputs = ['-i', base], filters = []
  plan.forEach((s, i) => {
    const x = decode(s.file), gain = ref + ROLE_DB[s.role] + (s.offset ?? 0) - db(peakOf(x)), delay = Math.round(Math.max(0, s.at - loudestAt(x)) * 1000)
    const pitch = s.pitch && canPitch() ? `rubberband=pitch=${(2 ** (s.pitch / 12)).toFixed(4)},` : ''
    inputs.push('-i', s.file)
    filters.push(`[${i + 1}:a]aformat=sample_rates=${SR}:channel_layouts=stereo,${pitch}volume=${gain.toFixed(1)}dB,adelay=${delay}|${delay}[s${i}]`)
  })
  const mix = `[0:a]aformat=sample_rates=${SR}:channel_layouts=stereo[b];` + (filters.length ? filters.join(';') + ';' : '') + `[b]${plan.map((_, i) => `[s${i}]`).join('')}amix=inputs=${plan.length + 1}:normalize=0:duration=first,alimiter=limit=0.89,loudnorm=I=-14:TP=-1.5:LRA=11[a]`
  const r = spawnSync(FF, ['-v', 'error', '-y', ...inputs, '-filter_complex', mix, '-map', '[a]', '-ar', String(SR), outWav], { maxBuffer: 1 << 26 })
  if (r.status !== 0) throw new Error('sfx mix failed: ' + (r.stderr?.toString().slice(-300) ?? ''))
  return outWav
}

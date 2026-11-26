// node audio/stitch.mjs [segDir] [outVideo]
// Joins the sharded silent video segments (out/seg-*.mp4) rendered in parallel by CI, merges the
// SFX events they each logged (out/sfx-events-*.json), then builds the soundtrack (voice + score +
// SFX) exactly like render.mjs does for a full render, and muxes video + audio into the final MP4.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ffmpegPath } from '../lib/ffmpeg.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FF = await ffmpegPath().catch(() => 'ffmpeg')

if (spawnSync(FF, ['-version']).status !== 0) {
  console.error('ffmpeg is missing. In the workspace folder run: node setup.mjs')
  process.exit(1)
}

const segDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'out')
const outVideo = process.argv[3] ? path.resolve(process.argv[3]) : path.join(ROOT, 'out', 'video.mp4')

const segs = fs.readdirSync(segDir).filter((f) => /^seg-(\d+)\.mp4$/.test(f)).sort((a, b) => {
  const n = (f) => +f.match(/^seg-(\d+)\.mp4$/)[1]
  return n(a) - n(b)
})
if (!segs.length) { console.error(`no segments found in ${segDir} (expected seg-0.mp4, seg-1.mp4, ...)`); process.exit(1) }

// 1. concat the picture segments (same encoder settings, so stream copy is safe)
const list = path.join(segDir, 'concat.txt')
fs.writeFileSync(list, segs.map((f) => `file '${path.join(segDir, f).replace(/'/g, "'\\''")}'`).join('\n') + '\n')
const joined = path.join(segDir, 'joined.mp4')
const c = spawnSync(FF, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined])
if (c.status !== 0) { console.error('concat failed: ' + (c.stderr?.toString().slice(-400) ?? '')); process.exit(1) }

// 2. merge the SFX events logged by every segment
const evFiles = fs.readdirSync(segDir).filter((f) => /^sfx-events-(\d+)\.json$/.test(f)).sort()
const events = []
for (const f of evFiles) {
  try { events.push(...JSON.parse(fs.readFileSync(path.join(segDir, f), 'utf8'))) } catch { /* a segment without events is fine */ }
}
events.sort((a, b) => (a.at ?? 0) - (b.at ?? 0))

// 3. the soundtrack under the picture: voice + score (or the person's music)
const story = JSON.parse(fs.readFileSync(path.join(ROOT, 'story.json'), 'utf8'))
const voicePath = path.join(ROOT, 'voice', 'voice.mp3')
const voice = fs.existsSync(voicePath) ? voicePath : null
let base = null
try { base = await (await import('./soundtrack.mjs')).soundtrack(ROOT, story) }
catch (e) { console.warn('soundtrack failed, using the voice alone:', e.message) }
const musicPath = story.music ? path.resolve(ROOT, story.music) : null
const music = musicPath && fs.existsSync(musicPath) ? musicPath : null
if (!base && (voice || music)) {
  const mv = story.musicVolume ?? (voice ? 0.15 : 0.8), b = path.join(ROOT, 'out', 'base.wav'), a = []
  if (voice) a.push('-i', voice)
  if (music) a.push('-stream_loop', '-1', '-i', music)
  const f = voice && music ? `[1:a]volume=${mv}[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]` : voice ? '[0:a]anull[a]' : `[0:a]volume=${mv}[a]`
  if (spawnSync(FF, ['-v', 'error', '-y', ...a, '-filter_complex', f, '-map', '[a]', b]).status === 0) base = b
}

// 4. the SFX plan + mix (same as render.mjs)
let audio = base
if (base && story.sfx !== false && events.length) {
  try {
    const { planSfx, savePlan } = await import('./sfx-plan.mjs'), { mixSfx } = await import('./sfx-mix.mjs')
    const plan = planSfx(events); savePlan(ROOT, plan)
    audio = mixSfx(base, voice, plan, path.join(ROOT, 'out', 'final.wav'))
    console.log(`sfx: ${plan.length} sounds (out/sfx-plan.json)`)
  } catch (e) { console.error('sfx skipped:', e.message) }
}
if (!audio) { console.error('no audio track to mux'); process.exit(1) }

// 5. picture + sound
const mux = ['-i', joined, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest']
const m = spawnSync(FF, ['-v', 'error', '-y', ...mux, '-movflags', '+faststart', outVideo])
fs.rmSync(list, { force: true }); fs.rmSync(joined, { force: true })
if (m.status !== 0) { console.error('muxing failed: ' + (m.stderr?.toString().slice(-400) ?? '')); process.exit(1) }
console.log(`Done: ${outVideo} (from ${segs.length} segments, ${events.length} sfx events)`)

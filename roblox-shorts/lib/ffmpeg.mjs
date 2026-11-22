// Finds ffmpeg: the one on this computer if there is one, otherwise the copy that `npm install` brought (ffmpeg-static).
import { spawnSync } from 'node:child_process'

let cached
export async function ffmpegPath() {
  if (cached) return cached
  if (spawnSync('ffmpeg', ['-version']).status === 0) return (cached = 'ffmpeg')
  try {
    const p = (await import('ffmpeg-static')).default
    if (p && spawnSync(p, ['-version']).status === 0) return (cached = p)
  } catch {}
  throw new Error('NO_FFMPEG: ffmpeg was not found. In the workspace folder run: node setup.mjs')
}
/** Run ffmpeg quietly; throws with its error text. */
export async function ffmpeg(...args) {
  const r = spawnSync(await ffmpegPath(), ['-v', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status) throw new Error(`ffmpeg failed: ${(r.stderr || '').slice(0, 400)}`)
}

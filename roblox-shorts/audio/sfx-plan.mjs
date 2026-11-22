// Sound effects for the blocky look: one sound per thing that appears, landing on its frame.
// The scene does not place sounds. The directing helpers (lib/blocky/direct.js) log what happens on screen while the
// video renders (a new shot and where its camera is, a character popping in, a big number or word, or d.sfx(...) for a
// story moment), and this file turns that log into a plan. sfx-mix.mjs then mixes the plan under the voice.
// The rules (the owner's, from the talking-head episodes):
//   - a whoosh only when the place changes (the camera jumps somewhere else); a plain cut inside a place is silent
//   - a big number or word slams in: camera, then pitched echoes, then break, never the same twice in a row, each a bit lower
//   - a character popping in gets a soft click, quieter than everything else
//   - (Mr omi) every visible event sounds: the engine logs appear/vanish/bursts/inserts/knocks/jumps/landings itself; a cut
//     with nothing else sounding gets a very quiet tick
//   - keep air: two sounds closer than 0.18 s keep only the more important one
//   - no novelty sounds, no typing, no cartoon foley unless the story asks for it with d.sfx(...)
import fs from 'node:fs'
import path from 'node:path'

const KIT = path.join(path.dirname(new URL(import.meta.url).pathname), 'sfx-kit')
/** The sounds d.sfx(name) can ask for, and the role each plays in the mix. */
export const SOUNDS = {
  whoosh: ['whoosh-1.wav', 'transition'], whoosh2: ['whoosh-2.wav', 'transition'], swoosh: ['whoosh-3.wav', 'transition'],
  click: ['click.wav', 'kit'], tick: ['click.wav', 'subtle'], pop: ['pop.wav', 'soft'], ting: ['ting.wav', 'soft'],
  camera: ['camera.wav', 'impact'], snap: ['snap.wav', 'impact'], break: ['break.wav', 'impact'], hit: ['hit.wav', 'impact'], drop: ['drop.wav', 'subtle'],
}
const RANK = { impact: 4, transition: 3, soft: 2, kit: 1.5, subtle: 1 }

/** events: what the render logged ({ kind, key, at, cam?, name?, text? }). Returns [{ what, at, file, role, pitch?, offset? }]. */
export function planSfx(events, { placeJump = 40 } = {}) {
  const first = new Map(); for (const e of events) if (!first.has(e.key)) first.set(e.key, e) // the first frame it was seen
  const ev = [...first.values()].sort((a, b) => a.at - b.at), out = []
  const add = (what, at, name, extra = {}) => { const [file, role] = SOUNDS[name]; out.push({ what, at: +Math.max(0, at).toFixed(3), file: path.join(KIT, file), role, ...extra }) }
  let prevCam = null, wn = 0, sn = 0
  const whooshes = ['whoosh', 'whoosh2', 'swoosh'], slams = [['camera', 0], ['camera', 2], ['break', 0], ['camera', -2], ['snap', 0], ['break', -2]]
  for (const e of ev) {
    if (e.kind === 'shot') {
      if (prevCam && e.cam && Math.hypot(e.cam[0] - prevCam[0], e.cam[1] - prevCam[1], e.cam[2] - prevCam[2]) > placeJump) add(`new place (${e.key})`, e.at, whooshes[wn++ % 3])
      else if (prevCam) add(`cut (${e.key})`, e.at, 'tick', { offset: -4, cut: true })   // Mr omi: a quiet tick where nothing else sounds (dropped below if something does)
      if (e.cam) prevCam = e.cam
    } else if (e.kind === 'big') { const [f, pitch] = slams[sn % slams.length]; add(`big "${e.text}"`, e.at + 0.08, f, { pitch, offset: -2 - Math.min(sn, 3) }); sn++ }
    else if (e.kind === 'pop') add(`${e.name} pops in`, e.at + 0.05, 'click', { offset: -2 })
    else if (e.kind === 'sfx' && SOUNDS[e.name]) add(e.what ?? e.name, e.at, e.name, { offset: e.gain ?? 0, pitch: e.pitch ?? 0 })
  }
  out.sort((a, b) => a.at - b.at)
  for (let i = out.length - 1; i >= 0; i--) if (out[i].cut && out.some((o) => o !== out[i] && !o.cut && Math.abs(o.at - out[i].at) < 0.3)) out.splice(i, 1)
  const kept = []
  for (const s of out) { const p = kept[kept.length - 1]; if (p && s.at - p.at < 0.18) { if (RANK[s.role] > RANK[p.role]) kept[kept.length - 1] = s } else kept.push(s) }
  return kept
}

/** Write the plan next to the video so the person (and you) can read every sound with its time and reason. */
export function savePlan(root, plan) {
  fs.mkdirSync(path.join(root, 'out'), { recursive: true })
  fs.writeFileSync(path.join(root, 'out', 'sfx-plan.json'), JSON.stringify({ events: plan.map((s) => ({ ...s, file: path.basename(s.file) })) }, null, 1))
}

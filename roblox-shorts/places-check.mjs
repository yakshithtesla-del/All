// The place plan and the history: every line of the script happens somewhere real, and no video repeats a recent one.
//   story.json "places": [
//     { "name": "the ward", "lines": [1, "2-4"], "build": "kit:hospital-kit-2ebfcb", "models": ["hospital-bed-31132d"] },
//     { "name": "the street outside", "lines": [5, 6], "build": "world:suburb" },
//     { "name": "the bedroom", "lines": [7], "build": "room:bedroom" },
//     { "name": "the rocket", "lines": [8], "build": "hand", "why": "no kit or model has a rocket like the story's" } ]
//   story.json "repeat": "part 2 of the same series"   (only when the person asked for a follow-up in the same places)
// The history lives on this computer: ~/roblox-shorts/history.json (FK_HISTORY to move it). render.mjs video writes to
// it after a finished render; `node render.mjs history` lists it, so a new story can pick places the last ones did not use.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const HISTORY = process.env.FK_HISTORY ?? path.join(os.homedir(), 'roblox-shorts', 'history.json')
export const readHistory = () => { try { return JSON.parse(fs.readFileSync(HISTORY, 'utf8')) } catch { return [] } }

const lineSet = (lines) => { const s = new Set(); for (const l of lines ?? []) { const m = String(l).match(/^(\d+)\s*-\s*(\d+)$/); if (m) for (let i = +m[1]; i <= +m[2]; i++) s.add(i); else if (+l) s.add(+l) } return s }
const label = (p) => [p.build, p.theme, p.seed != null ? `seed ${p.seed}` : null].filter(Boolean).join(' · ')

/** Checks the story's place plan against what the scene built. Returns { errors: [], notes: [] }. */
export function checkPlaces(story, built, models, beats) {
  const errors = [], notes = []
  const places = story.places ?? []
  if (!places.length) { errors.push('story.json has no "places": write the place plan (SKILL.md, step "The places"): every line gets a place, each built from a kit, a world or a room') ; return { errors, notes } }
  const covered = new Set(); for (const p of places) for (const i of lineSet(p.lines)) covered.add(i)
  const missing = []; for (let i = 1; i <= beats; i++) if (!covered.has(i)) missing.push(i)
  if (missing.length) errors.push(`line(s) ${missing.join(', ')} have no place in story.json "places"`)
  const builds = new Set(built.map((b) => b.build))
  for (const p of places) {
    const b = String(p.build ?? '')
    if (b === 'hand') { if (String(p.why ?? '').trim().length < 12) errors.push(`"${p.name}" is built by hand: say why no kit or model fits in its "why"`); else notes.push(`"${p.name}" built by hand: ${p.why}`) }
    else if (!/^(kit|world|room):/.test(b)) errors.push(`"${p.name}": build must be kit:<kit-id>, world:<kind>, room:<kind> or hand (got "${b}")`)
    else if (!builds.has(b)) errors.push(`"${p.name}" says ${b}, but the scene never built it (kitPlace / world / indoor)`)
    for (const id of p.models ?? []) if (!models.includes(id)) errors.push(`"${p.name}" lists the model ${id}, but the scene never used it (node pf.mjs get ${id}; model('${id}'))`)
  }
  return { errors, notes }
}

/** Compares this video with the recent ones (other projects). Returns { errors: [], notes: [] }. */
const isExample = (story) => story.example && (story.beats ?? []).every((b) => b.scene === 'balloons') // the shipped example only

export function checkRepeat(story, built, models, root) {
  const errors = [], notes = []
  if (isExample(story)) return { errors, notes: ['the shipped example: history not checked'] }
  const recent = readHistory().filter((h) => h.project !== root).slice(-8)
  if (!recent.length) return { errors, notes: ['first video in the history'] }
  for (const p of built) for (const h of recent) if (h.places?.some((q) => q.build === p.build && (q.theme ?? null) === (p.theme ?? null) && q.seed === p.seed)) errors.push(`${label(p)} is the same place, theme and seed as "${h.title}": change the seed, the theme or the place`)
  const first = (s, b) => { const p = (s.places ?? [])[0]; return p ? b.find((x) => x.build === p.build) ?? { build: p.build } : b[0] }
  const open = first(story, built)
  for (const h of recent.slice(-2)) if (open && h.open && h.open.build === open.build && (h.open.theme ?? null) === (open.theme ?? null)) errors.push(`opens in the same place as "${h.title}" (${label(open)}): open somewhere else, or in another theme`)
  const last = recent[recent.length - 1], a = new Set(models), b = new Set(last.models ?? []), both = [...a].filter((x) => b.has(x)).length, any = new Set([...a, ...b]).size
  if (a.size >= 4 && any && both / any >= 0.6) errors.push(`${Math.round((100 * both) / any)}% of the models are the same as "${last.title}": pick other kits or models`)
  if (story.repeat && errors.length) return { errors: [], notes: errors.map((e) => `allowed (repeat: ${story.repeat}): ${e}`) }
  return { errors, notes }
}

export function addHistory(story, built, models, root) {
  if (isExample(story)) return
  const all = readHistory().filter((h) => h.project !== root)
  const first = (story.places ?? [])[0], open = first ? built.find((x) => x.build === first.build) ?? { build: first.build } : built[0]
  all.push({ at: new Date().toISOString(), title: story.title ?? path.basename(root), project: root, open: open ? { build: open.build, theme: open.theme ?? null, seed: open.seed ?? null } : null, places: built.map((p) => ({ build: p.build, theme: p.theme ?? null, seed: p.seed ?? null })), models })
  fs.mkdirSync(path.dirname(HISTORY), { recursive: true }); fs.writeFileSync(HISTORY, JSON.stringify(all.slice(-50), null, 1))
}

export function printHistory() {
  const h = readHistory()
  if (!h.length) return console.log('No videos yet: any place, theme and seed is free.')
  for (const v of h.slice(-10)) console.log(`${v.at.slice(0, 10)}  ${v.title}\n    ${(v.places ?? []).map(label).join('  |  ')}`)
  console.log('A new video opens somewhere else, and uses other kits, themes and seeds than these.')
}

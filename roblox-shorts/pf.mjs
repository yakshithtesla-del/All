// Find and fetch 3D models for this story from Polyfork (polyfork.dev: thousands of free low-poly models in themed kits).
// Only what the story needs is downloaded, into ./models/ (the scene loads them with model() from lib/blocky).
//   node pf.mjs search school bus            best matches: id, title, kind, size, kit  (--class vehicle|building|prop|character|animal)
//   node pf.mjs kits [words]                 the themed kits (school, neighborhood, halloween, hospital, cafe...)
//   node pf.mjs kit <kit-id>                 every part of one kit (things from one kit share colours and scale)
//   node pf.mjs place <kit-id>               a whole place from one kit: its parts sorted into floor, walls, buildings,
//                                            fences and props (models/kits/<kit-id>.json), for kitPlace() in the scene
//   node pf.mjs get <id> [<id> ...]          download them into ./models/ and note them in models/index.json
//   node pf.mjs list                         what this project already has
// Licence: free models, used to make videos (no credit needed). The files stay in this project; never share them as files.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url)), DIR = path.join(ROOT, 'models'), API = 'https://polyfork.dev/api'
const UA = { 'user-agent': 'roblox-shorts-skill/3.0 (video toolkit; fetches only what a story needs)' }
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
async function get(url, as = 'json') {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, { headers: UA })
    if (r.status === 429 || r.status >= 500) { await sleep(1500 * 2 ** i); continue }
    if (!r.ok) throw new Error(`${r.status} for ${url}`)
    return as === 'json' ? r.json() : Buffer.from(await r.arrayBuffer())
  }
  throw new Error(`gave up on ${url} (busy)`)
}
const size = (s) => (s ? `${s.x}x${s.y}x${s.z} m` : '')
const opt = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const words = process.argv.slice(3).filter((w, i, a) => !w.startsWith('--') && !(a[i - 1] ?? '').startsWith('--'))
const index = () => (fs.existsSync(path.join(DIR, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')) : {})

const cmd = process.argv[2]
if (cmd === 'search') {
  const q = new URLSearchParams({ q: words.join(' '), free: '1', per_page: String(opt('--n') ?? 12) }); if (opt('--class')) q.set('class', opt('--class'))
  const d = await get(`${API}/assets?${q}`)
  if (d.coverage === false || !d.assets?.length) console.log(`nothing answers "${words.join(' ')}"; try other words`)
  for (const a of d.assets ?? []) console.log(`${a.id.padEnd(44)} ${a.title} · ${a.class} · ${a.triangles} tris${a.kit ? ' · kit ' + a.kit : ''}${a.has_night ? ' · night' : ''}`)
} else if (cmd === 'kits') {
  const d = await get(`${API}/kits`), w = words.map((x) => x.toLowerCase())
  for (const k of d.kits ?? d) if (!w.length || w.some((x) => (k.title + ' ' + k.id).toLowerCase().includes(x))) console.log(`${k.id.padEnd(44)} ${k.title}`)
} else if (cmd === 'kit') {
  const d = await get(`${API}/kits/${words[0]}`)
  console.log(d.title ?? words[0]); for (const p of d.parts ?? d.assets ?? []) console.log(`  ${p.id.padEnd(44)} ${p.title} · ${p.class ?? ''} · ${p.triangles} tris`)
} else if (cmd === 'get') {
  fs.mkdirSync(DIR, { recursive: true }); const idx = index()
  for (const id of words) {
    const a = await get(`${API}/assets/${id}`), f = path.join(DIR, `${id}.glb`)
    if (!fs.existsSync(f)) fs.writeFileSync(f, await get(a.download?.glb ?? `https://polyfork.dev/cdn/${id}.glb`, 'buf'))
    idx[id] = { title: a.title, class: a.class, kit: a.kit, size_m: a.size_m, rigged: a.rigged_parts ?? {}, night: a.night ?? null, describe: a.description }
    console.log(`got ${id} · ${a.title} · ${size(a.size_m)}${Object.keys(a.rigged_parts ?? {}).length ? ' · moving parts: ' + Object.keys(a.rigged_parts).join(', ') : ''}`)
    await sleep(250)
  }
  fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(idx, null, 1))
} else if (cmd === 'place') {
  // A whole place from one kit: every usable part, sorted into what it is for, so kitPlace() can lay it out.
  const kid = words[0]; if (!kid) { console.log('node pf.mjs place <kit-id>   (find kits with: node pf.mjs kits <words>)'); process.exit(1) }
  const k = await get(`${API}/kits/${kid}`), parts = k.parts ?? []
  const roles = { floor: [], ground: [], wall: [], window: [], building: [], edge: [], inside: [], outside: [], onwall: [], small: [], vehicle: [] }
  const GROUND = /paving|lawn|grass|ground|asphalt|road|sand|cobble|path|dirt|snow|turf|pitch|boardwalk|gravel|soil|field|patch|yard|hardstanding|terrace/i
  const SKIP = /ceiling|decal|marking|hatching|light run|string|sky|pendant|hanging|cobweb|canopy|heat lamp|surgical light|awning|bunting|garland/i
  const ONWALL = /sign|clock|sconce|board|box|display|neon|mirror|poster|frame|menu|wreath|shelf|rail|hook|peg|extinguisher|tv|screen/i
  const WALL = /wall module|partition|wall panel|facade|wall section|wall unit|window module|glaz|curtain wall/i
  const OUT = /bench|bollard|post|planter|tree|bush|shrub|hedge|rock|boulder|stone|grave|headstone|tomb|fountain|street|kiosk|stall|hydrant|mailbox|signpost|tent|campfire|well|barrel|crate|pumpkin|scarecrow|haystack|hay|log|stump|flower|cactus|statue|swing|slide|bin|dumpster|cone|barrier|bike|boat|canoe|picnic|grill|bbq|shed|pole|lamp ?post|lantern|gate|goal|hoop|parasol|heater|inflatable|silhouette|angel|mound|luminaria|vine|olive/i
  const IN = /bed|desk|chair|table|cabinet|shelf|shelves|locker|sofa|couch|counter|sink|fridge|stool|monitor|computer|machine|trolley|lamp|tv|bookcase|wardrobe|dispenser|curtain|rug|piano|oven|stove|range|booth|cart|printer|plant|easel|cot|incubator|scanner|altar|throne|chest|bath|toilet|dresser|freezer|case|cubby|kiln|mat|horse|globe|roaster|urn|station|rack|cauldron/i
  for (const p of parts) {
    const s = p.size_m ?? {}, lo = Math.min(s.x ?? 0, s.z ?? 0), hi = Math.max(s.x ?? 0, s.z ?? 0), t = p.title ?? ''
    if (['character', 'attachment', 'hand', 'terrain'].includes(p.class) || SKIP.test(t) || !s.y) continue
    if (s.y <= 0.15 && Math.abs(s.x - s.z) < 0.1 && s.x >= 0.9 && s.x <= 4.1) { (GROUND.test(t) ? roles.ground : roles.floor).push(p.id); continue } // square tiles, 1 / 2 / 4 m
    if (s.y <= 0.15) continue // decals, mats and thin bits
    if (lo <= 0.4 && hi >= 1.9 && hi <= 4.1 && s.y >= 2.3 && WALL.test(t)) { (/glaz|window|glass/i.test(t) ? roles.window : roles.wall).push(p.id); continue }
    if (lo <= 0.22 && s.y <= 1.4 && hi <= 3.2 && ONWALL.test(t)) { roles.onwall.push(p.id); continue } // hangs on a wall
    if (lo <= 1.1 && hi >= 1.9 && hi <= 4.1 && s.y < 2.6 && /fence|hedge|wall|rail|barrier|run|railing|maze/i.test(t)) { roles.edge.push(p.id); continue }
    if (p.class === 'vehicle') { if (hi <= 8) roles.vehicle.push(p.id); continue }
    if (p.class === 'building') { if (lo >= 2.5 && hi <= 30) roles.building.push(p.id); continue }
    if (hi > 5 || s.y > 6) continue // too big to be a prop
    if (hi < 0.45 && s.y < 0.5) { roles.small.push(p.id); continue } // cups, bowls, books: they go on tables
    if (OUT.test(t)) roles.outside.push(p.id); else if (IN.test(t)) roles.inside.push(p.id); else { roles.inside.push(p.id); roles.outside.push(p.id) }
  }
  const all = [...new Set(Object.values(roles).flat())]
  fs.mkdirSync(path.join(DIR, 'kits'), { recursive: true }); const idx = index()
  for (const id of all) {
    const p = parts.find((x) => x.id === id), f = path.join(DIR, `${id}.glb`)
    if (!fs.existsSync(f)) { fs.writeFileSync(f, await get(p.download?.glb ?? `https://polyfork.dev/cdn/${id}.glb`, 'buf')); await sleep(150) }
    idx[id] ??= { title: p.title, class: p.class, kit: kid, size_m: p.size_m, rigged: p.rigged_parts ?? {}, night: p.night ?? null }
  }
  fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(idx, null, 1))
  const out = { id: kid, title: k.title, palette: k.usage?.palette ?? [], roles }
  fs.writeFileSync(path.join(DIR, 'kits', `${kid}.json`), JSON.stringify(out, null, 1))
  console.log(`${k.title}: ${all.length} parts in models/ (models/kits/${kid}.json)`)
  for (const [r, ids] of Object.entries(roles)) if (ids.length) console.log(`  ${r.padEnd(9)} ${ids.map((id) => parts.find((x) => x.id === id).title).join(', ')}`)
  console.log(`Build it: await loadKit('${kid}'); const p = kitPlace({ kit: '${kid}', mode: 'room' | 'yard', seed })`)
} else if (cmd === 'list') {
  for (const [id, a] of Object.entries(index())) console.log(`${id.padEnd(44)} ${a.title} · ${size(a.size_m)}`)
} else {
  console.log('node pf.mjs search <words> [--class vehicle] | kits [words] | kit <kit-id> | place <kit-id> | get <id>... | list')
}

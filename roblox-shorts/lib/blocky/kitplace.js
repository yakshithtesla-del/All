// A place from any Polyfork kit (hospital, cafe, school, halloween, farm, airport, stadium, dungeon... ~55 of them):
// its own floor tiles, walls, buildings, fences and props, laid out by a seed so every story gets its own room or yard.
//   shell:    node pf.mjs kits hospital        ->  node pf.mjs place hospital-kit-2ebfcb
//   create(): await loadKit('hospital-kit-2ebfcb')
//             const ward = kitPlace({ kit: 'hospital-kit-2ebfcb', mode: 'room', seed: 7, at: [300, 0, 0] }); scene.add(ward.root)
//             const yard = kitPlace({ kit: 'halloween-night-46ade4', mode: 'yard', theme: 'night', seed: 3 }); scene.add(yard.root); scene.fog = yard.fog
// Units are studs (1 m = 2.9). A room is open toward +z (the camera side); people stand inside its `stage` circle,
// which no prop enters. Pick the parts yourself when the story names them: props: [ids] goes first, the seed fills the rest.
import { T } from './core.js'
import { loadModels, model, modelInfo, STUDS_PER_M as S } from './models.js'
import { texturize, daylight, backdrop, clearer } from './places.js'
import { CITY_THEMES } from './world.js'

const KITS = {}
const rng = (seed) => { let s = 1 + ((seed * 7919) % 2147483646); return () => ((s = (s * 16807) % 2147483647) / 2147483647) }
const pick = (r, a) => a[Math.floor(r() * a.length)]
const shuffle = (r, a) => a.map((x) => [r(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1])
const G = 2 * S // the kits' 2 m grid, in studs

/** Load a kit fetched with `node pf.mjs place <kit-id>` (all its parts). Call in create() before kitPlace(). */
export async function loadKit(id, base = '/models/') {
  if (KITS[id]) return KITS[id]
  const k = await fetch(`${base}kits/${id}.json`).then((r) => (r.ok ? r.json() : null))
  if (!k) throw new Error(`loadKit: models/kits/${id}.json is missing. Run: node pf.mjs place ${id}`)
  await loadModels([...new Set(Object.values(k.roles).flat())], base)
  return (KITS[id] = k)
}

/** A copy of a part, turned by ry, moved so its footprint centre is at (x, z) and its base at y. Returns { m, box }. */
function put(parent, id, x, z, ry = 0, y = 0, used, night) {
  const m = model(id, { night }); m.userData.fixed = true; m.rotation.y = ry; m.updateMatrixWorld(true) // fixed: the frame check measures it once
  const b = new T.Box3().setFromObject(m), c = b.getCenter(new T.Vector3())
  m.position.set(x - c.x, y - b.min.y, z - c.z); parent.add(m); used?.add(id)
  b.translate(new T.Vector3(x - c.x, y - b.min.y, z - c.z)); return { m, box: b }
}
const sizeOf = (id, ry = 0) => { const s = modelInfo(id).size_m ?? { x: 1, y: 1, z: 1 }, q = Math.abs(Math.sin(ry)) > 0.5; return { w: (q ? s.z : s.x) * S, h: s.y * S, d: (q ? s.x : s.z) * S } }
const TABLE = /table|desk|counter|bench|cabinet|case|locker|chest|dresser|unit|shelf|crate|barrel|stall|bar\b/i

/**
 * kit: a kit id loaded with loadKit(). mode: 'room' (floor, three walls, furniture) or 'yard' (ground, buildings at the
 * back, fences, props, the photo sky and forest). seed: changes the size, the wall pattern and what stands where.
 * opts: at [x, y, z] (where the centre goes), size [w, d] in 2 m modules (room 5..6 x 4, yard 9 x 7), theme (yard:
 * sunny | pastel | autumn | snow | night), night (lights in the models glow), stage [[x, z, r]] (room coordinates; the
 * default keeps the middle front clear for the cast), and lists that replace the kit's own picks: floor, walls,
 * windows, props, onwall, small, buildings, edge, vehicles (ids from `node pf.mjs place`), plus props: [ids] that
 * must appear. Returns { root, kind: 'room' | 'yard', kit, seed, size: [W, D] in studs, stage, plan (for life()),
 * clear, and for a yard the sky: fog, mood(name, at), sun, hemi }.
 */
export function kitPlace({ kit, mode = 'room', seed = 1, at = [0, 0, 0], size, theme = 'sunny', night, stage, must = [], ...over } = {}) {
  const K = KITS[kit]; if (!K) throw new Error(`kitPlace: kit "${kit}" is not loaded. Run node pf.mjs place ${kit}, then await loadKit('${kit}') in create().`)
  const R = { ...K.roles }; for (const k of Object.keys(over)) if (Array.isArray(over[k])) R[k] = over[k]
  const r = rng(seed * 31 + kit.length), root = new T.Group(), used = new Set(); root.position.set(...at)
  const TH = CITY_THEMES[theme] ?? CITY_THEMES.sunny; night ??= mode === 'yard' && !!TH.lit
  const room = mode === 'room', [nx, nz] = size ?? (room ? [5 + Math.floor(r() * 2), 4] : [9, 7]), W = nx * G, D = nz * G
  stage ??= room ? [[0, D * 0.12, Math.min(W, D) * 0.3]] : [[0, D * 0.1, 12]]
  const taken = [] // footprints (x0, z0, x1, z1) already used
  const free = (b, pad = 0.5) => taken.every((t) => b.max.x + pad < t[0] || b.min.x - pad > t[2] || b.max.z + pad < t[1] || b.min.z - pad > t[3]) && stage.every(([sx, sz, sr]) => { const cx = Math.max(b.min.x, Math.min(sx, b.max.x)), cz = Math.max(b.min.z, Math.min(sz, b.max.z)); return Math.hypot(cx - sx, cz - sz) > sr })
  const keep = (b) => taken.push([b.min.x, b.min.z, b.max.x, b.max.z])
  const tryPut = (id, x, z, ry, y = 0) => { const s = sizeOf(id, ry), b = new T.Box3(new T.Vector3(x - s.w / 2, y, z - s.d / 2), new T.Vector3(x + s.w / 2, y + s.h, z + s.d / 2)); if (!free(b)) return null; const p = put(root, id, x, z, ry, y, used, night); keep(p.box); return p }
  const pal = K.palette ?? [], light = pal[0] ?? '#eef1f4', mid = pal[Math.min(3, pal.length - 1)] ?? '#d9dfe3'
  const plain = (w, h, d, color, x, y, z, tex) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshStandardMaterial({ color, roughness: 0.85 })); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; m.userData.tex = tex; root.add(m); return m }

  // ---- ground: the kit's tiles (lowered so their top is y 0, where people stand), on a base so no gap shows
  const tiles = room ? R.floor : (R.ground?.length ? R.ground : R.floor), tile = tiles?.length ? pick(r, tiles) : null
  const x0 = room ? -W / 2 : -W / 2 - 2 * G, x1 = -x0, z0 = -D / 2, z1 = room ? D / 2 + G : D / 2 + 3 * G
  if (tile) { const ts = (modelInfo(tile).size_m?.x ?? 2) * S, th = (modelInfo(tile).size_m?.y ?? 0.05) * S, alt = tiles.length > 1 && r() < 0.5 ? tiles.find((t) => t !== tile && Math.abs((modelInfo(t).size_m?.x ?? 0) * S - ts) < 0.1) : null
    for (let x = x0 + ts / 2; x < x1; x += ts) for (let z = z0 + ts / 2; z < z1; z += ts) put(root, alt && (Math.round((x + z) / ts) % 5 === 0) ? alt : tile, x, z, 0, -th, used) }
  const base = plain(room ? W + 1 : 900, 0.4, room ? D + G + 1 : 900, room ? mid : TH.grass, 0, tile ? -0.6 : -0.2, room ? G / 2 : 0, room ? 'tiles' : 'grass'); base.castShadow = false

  if (room) {
    // ---- walls: back + two sides of the kit's wall modules (some glazed), or plain painted walls
    const wh = 3 * S, mods = R.wall ?? [], wins = R.window ?? []
    const wallAt = (x, z, ry) => { if (mods.length) { const id = wins.length && r() < 0.28 ? pick(r, wins) : pick(r, mods); put(root, id, x, z, ry, 0, used) } }
    if (mods.length) {
      for (let i = 0; i < nx; i++) wallAt(-W / 2 + G * (i + 0.5), -D / 2, 0)
      for (let i = 0; i < nz; i++) { wallAt(-W / 2, -D / 2 + G * (i + 0.5), Math.PI / 2); wallAt(W / 2, -D / 2 + G * (i + 0.5), -Math.PI / 2) }
    } else {
      const wc = pick(r, pal.slice(0, 4).length ? pal.slice(0, 4) : ['#e6eaed'])
      plain(W, wh, 0.4, wc, 0, wh / 2, -D / 2, 'concrete'); for (const s of [-1, 1]) plain(0.4, wh, D, wc, s * W / 2, wh / 2, 0, 'concrete')
    }
    // vertical shots see high up: a painted band over the kit's 3 m walls, a trim line, and a bright ceiling at 14 studs
    const H = 14, band = pal[Math.min(2, pal.length - 1)] ?? mid, ceil = new T.MeshStandardMaterial({ color: light, roughness: 0.9, emissive: light, emissiveIntensity: 0.22 })
    plain(W + 0.4, H - wh, 0.3, band, 0, wh + (H - wh) / 2, -D / 2 - 0.25, 'concrete'); for (const s of [-1, 1]) plain(0.3, H - wh, D, band, s * (W / 2 + 0.25), wh + (H - wh) / 2, 0, 'concrete')
    plain(W, 0.35, 0.5, mid, 0, wh + 0.18, -D / 2 + 0.05, 'none').castShadow = false
    const shell = new T.Mesh(new T.BoxGeometry(W + 1.2, H + 1.2, D + 60), new T.MeshStandardMaterial({ color: light, roughness: 0.9, side: T.BackSide, emissive: light, emissiveIntensity: 0.25 }))
    shell.position.set(0, H / 2 - 0.3, 30 - 0.4); shell.userData.tex = 'none'; shell.userData.shell = true; root.add(shell) // so a camera standing back never sees the sky
    const top = new T.Mesh(new T.BoxGeometry(W + 0.8, 0.3, D + 0.4), ceil); top.position.set(0, H + 0.15, 0); top.userData.tex = 'none'; root.add(top)
    for (const x of [-W / 4, W / 4]) { const l = new T.PointLight('#fff2dc', 40, W * 2, 1.2); l.position.set(x, H - 2, D * 0.15); root.add(l) }
    const inner = 0.45 // half a wall module's thickness + a little
    // ---- furniture: first what the story asked for, then the seed's picks, against the back wall and the sides
    const props = shuffle(r, R.inside ?? []), queue = [...must, ...props, ...shuffle(r, props)]
    let qi = 0; const next = () => queue[qi++ % Math.max(1, queue.length)]
    const placed = []
    for (let x = -W / 2 + inner + 0.6; x < W / 2 - 1 && queue.length;) { const id = next(), s = sizeOf(id); if (x + s.w > W / 2 - inner) { x += 1; continue } const p = tryPut(id, x + s.w / 2, -D / 2 + inner + s.d / 2 + 0.05, 0); if (p) placed.push([id, p]); x += s.w + 0.5 + r() * 2.2 }
    for (const sd of [-1, 1]) for (let z = -D / 2 + inner + 3; z < D * 0.3 && queue.length;) { const ry = -sd * Math.PI / 2, id = next(), s = sizeOf(id, ry); const p = tryPut(id, sd * (W / 2 - inner - s.w / 2 - 0.05), z + s.d / 2, ry); if (p) placed.push([id, p]); z += s.d + 0.6 + r() * 2.4 }
    for (let n = 0, tries = 0; n < 1 + Math.floor(r() * 2) && tries < 30; tries++) { const id = next(), x = (r() - 0.5) * (W - 8), z = -D / 2 + 5 + r() * (D * 0.35); const p = tryPut(id, x, z, pick(r, [0, Math.PI / 2, -Math.PI / 2])); if (p) { placed.push([id, p]); n++ } }
    // ---- small things on the tables, things on the walls
    const small = R.small ?? []
    if (small.length) for (const [id, p] of placed) { if (!TABLE.test(modelInfo(id).title ?? '') || p.box.max.y > 4.2 || p.box.max.y < 1.6) continue; const n = 1 + Math.floor(r() * 2); for (let i = 0; i < n; i++) { const sid = pick(r, small), ss = sizeOf(sid), sx = p.box.min.x + ss.w / 2 + r() * Math.max(0, p.box.max.x - p.box.min.x - ss.w), sz = (p.box.min.z + p.box.max.z) / 2; put(root, sid, sx, sz, r() * 6, p.box.max.y, used) } }
    const onwall = R.onwall ?? []
    if (onwall.length) for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) {
      const id = pick(r, onwall), s = sizeOf(id), x = (r() - 0.5) * (W - s.w - 4), y = 4.4 + r() * 1.6
      if (placed.some(([, p]) => p.box.max.y > y - 0.3 && p.box.max.x > x - s.w / 2 && p.box.min.x < x + s.w / 2 && p.box.min.z < -D / 2 + 3)) continue
      put(root, id, x, -D / 2 + inner + s.d / 2 + 0.02, 0, y, used)
    }
  } else {
    // ---- yard: buildings along the back (front toward +z), maybe one on each side, fences, props, parked vehicles
    const bs = shuffle(r, R.building ?? [])
    let x = -W / 2 - G - r() * 6
    for (let i = 0; x < W / 2 + G && bs.length; i++) { const id = bs[i % bs.length], s = sizeOf(id); if (s.h > 60) continue; put(root, id, x + s.w / 2, -D / 2 - s.d / 2, 0, 0, used); taken.push([x, -D / 2 - s.d, x + s.w, -D / 2]); x += s.w + 2 + r() * 6 }
    for (const sd of [-1, 1]) { if (bs.length < 2 || r() < 0.35) continue; const id = pick(r, bs), ry = -sd * Math.PI / 2, s = sizeOf(id, ry); if (s.d > D * 0.8) continue; const p = put(root, id, sd * (W / 2 + s.w / 2), -D / 2 + 2 + s.d / 2, ry, 0, used); keep(p.box) }
    const edge = R.edge ?? []
    if (edge.length) { const id = pick(r, edge), len = Math.max(sizeOf(id).w, 2); for (const sd of [-1, 1]) for (let z = -D / 2 + 6; z < D / 2 + G; z += len) { const b = new T.Box3(new T.Vector3(sd * W / 2 - 1, 0, z), new T.Vector3(sd * W / 2 + 1, 3, z + len)); if (free(b, 0)) { const p = put(root, id, sd * W / 2, z + len / 2, Math.PI / 2, 0, used); keep(p.box) } } }
    const props = R.outside?.length ? R.outside : (R.inside ?? []), queue = [...must, ...shuffle(r, props)]
    for (let n = 0, tries = 0, want = 9 + Math.floor(r() * 6); n < want && tries < 200 && queue.length; tries++) {
      const id = queue[n % queue.length], nearBack = r() < 0.55, x = (r() - 0.5) * (W - 6), z = nearBack ? -D / 2 + 2 + r() * 8 : -D / 2 + 10 + r() * (D * 0.7)
      if (tryPut(id, x, z, nearBack ? 0 : pick(r, [0, Math.PI / 2, Math.PI, -Math.PI / 2]))) n++
    }
    for (const id of shuffle(r, R.vehicle ?? []).slice(0, Math.floor(r() * 3))) for (let t = 0; t < 12; t++) if (tryPut(id, pick(r, [-1, 1]) * (W / 2 - 6 - r() * 4), -D / 2 + 8 + r() * D * 0.6, pick(r, [0, Math.PI]))) break
    backdrop(root, r, TH, Math.max(W, D) / 2 + 40, theme === 'snow')
  }
  texturize(root)
  root.userData.world = true // the frame check measures it for people standing inside it
  const out = { root, kind: room ? 'room' : 'yard', kit, seed, size: [W, D], stage, clear: clearer(root),
    plan: { strips: [[at[0] - W / 2 + 2, at[0] - W / 2 + 8], [at[0] + W / 2 - 8, at[0] + W / 2 - 2]], z: [at[2] - D / 2 + 3, at[2] + D / 2 + (room ? 0 : 8)], road: null } }
  if (!room) Object.assign(out, daylight(root, TH))
  ;(globalThis.FK_PLACES ??= []).push({ build: `kit:${kit}`, mode: out.kind, theme: room ? null : theme, seed, models: [...used] })
  return out
}

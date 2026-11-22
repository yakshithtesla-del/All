// More kinds of places, so no two videos share a world. See api.md "Places".
//   world({ kind: 'city' | 'suburb' | 'meadow' | 'plaza', theme, seed })  ->  { root, fog, mood(name, at), kind }
//   indoor({ kind: 'living' | 'classroom' | 'diner' | 'library' | 'bedroom', at: [x, y, z], seed })  ->  a room (T.Group)
// Units are studs, people stand at y = 0 and face +z. Themes are the same five as the city's.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { T } from './core.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { M } from './materials.js'
import { sky, tree, house, city, CITY_THEMES } from './world.js'
import { model, modelInfo, STUDS_PER_M } from './models.js'
let OPTS = {} // world()'s houses / cars: Polyfork models the story picked

const mat = (color, rough = 0.85) => new T.MeshStandardMaterial({ color, roughness: rough })
function box(parent, w, h, d, color, x, y, z, kind) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), typeof color === 'string' ? mat(color) : color); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; if (kind) m.userData.tex = kind; parent.add(m); return m }
// ---------------------------------------------------------------- surface texture
// Flat colour reads as a toy. Every surface gets the kit's grain: a soft two-tone noise by default, or a pattern
// (grass, asphalt, brick, siding, shingle, planks, tiles, fabric) named in mesh.userData.tex. One repeat = SCALE studs.
const SCALE = { noise: 7, grass: 10, asphalt: 10, fabric: 6, brick: 10, siding: 8, shingle: 10, planks: 10, tiles: 10, cobble: 10, stone: 10, snow: 10, concrete: 10, wood: 10, sand: 10 }
const AMT = { noise: 0.11, grass: 0.12, asphalt: 0.2, fabric: 0.24 }
// Photo textures (textures/*.jpg, public domain, see textures/LICENSE.txt): loaded once by loadSurfaces(), which
// loadFonts() calls. Each is grey, so the part's own colour shows through, like a painted game material.
const PHOTO = {}, PHOTO_KINDS = ['grass', 'brick', 'cobble', 'stone', 'planks', 'shingle', 'asphalt', 'snow', 'tiles', 'concrete', 'wood', 'fabric', 'sand']
let surfacesReady = null
export function loadSurfaces(base = '/textures/') {
  const img = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src })
  return (surfacesReady ??= Promise.all([loadNature(base), ...PHOTO_KINDS.map(async (kind) => {
    try {
      const [a, n] = await Promise.all([img(base + kind + '.jpg'), img(base + kind + '_n.jpg')]), c = document.createElement('canvas'); c.width = c.height = 512
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(a, 0, 0, 512, 512); const im = g.getImageData(0, 0, 512, 512), d = im.data; let sum = 0
      for (let i = 0; i < d.length; i += 4) sum += d[i]
      const mean = sum / (d.length / 4), k = 0.95 // these are the game's own materials: keep their contrast, bring every texture to the same brightness
      for (let i = 0; i < d.length; i += 4) { const v = Math.max(40, Math.min(255, 204 + (d[i] - mean) * k * (204 / Math.max(60, mean)))); d[i] = d[i + 1] = d[i + 2] = v }
      g.putImageData(im, 0, 0)
      const map = new T.CanvasTexture(c); map.wrapS = map.wrapT = T.RepeatWrapping; map.colorSpace = T.SRGBColorSpace; map.anisotropy = 8
      const nor = new T.Texture(n); nor.wrapS = nor.wrapT = T.RepeatWrapping; nor.needsUpdate = true
      PHOTO[kind] = { map, nor }; globalThis.FK_SURF = PHOTO // world.js bakes these into building fronts
    } catch { /* the built-in pattern is used instead */ }
  })]))
}
// ---------------------------------------------------------------- real sky and photo trees
// The viral shorts are filmed in detailed game maps: a real cloudy sky and real trees. A hand-made gradient and green
// balls read as a kid's cartoon. textures/sky/day.hdr is a photo sky (Poly Haven, CC0): it is the daytime background
// and its light fills the shadows. textures/trees/*.png are Poly Haven trees (CC0) baked into cut-outs from 3 angles.
async function loadNature(base) {
  try { const meta = await (await fetch(base + 'trees/trees.json')).json(), L = new T.TextureLoader(), out = {}
    await Promise.all(Object.entries(meta).map(async ([k, m]) => { out[k] = { ...m, maps: await Promise.all([...Array(m.views)].map((_, i) => L.loadAsync(`${base}trees/${k}-${i}.png`).then((t) => { t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t }))) } }))
    globalThis.FK_TREES = out } catch { /* the drawn trees are used instead */ }
  try { const t = await new HDRLoader().loadAsync(base + 'sky/day.hdr'); t.mapping = T.EquirectangularReflectionMapping; globalThis.FK_SKY = t } catch { /* the gradient sky is used instead */ }
}
/**
 * A photo tree: kind 'fir_a' | 'fir_b' | 'fir_c' (tall firs) | 'island_tree_01' (a leafy tree), `height` studs tall,
 * standing at x, z. Three crossed cut-outs, so it looks full from any side. tint dims it for night or dusk.
 */
export function photoTree(kind, x, z, height = 18, tint = '#ffffff', turn = 0) {
  const P = globalThis.FK_TREES?.[kind]; if (!P) return null
  const g = new T.Group(), k = height / P.size[1], w = P.half * 2 * k, cy = (P.center[1] - P.base) * k
  P.maps.forEach((map, i) => {
    const m = new T.MeshBasicMaterial({ map, color: tint, alphaTest: 0.45, side: T.DoubleSide, fog: true })
    const q = new T.Mesh(new T.PlaneGeometry(w, w), m); q.position.y = cy; q.rotation.y = turn + (i * Math.PI) / P.maps.length; q.castShadow = true
    q.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map, alphaTest: 0.45 }); q.userData.tex = 'none'; g.add(q)
  })
  g.position.set(x, 0, z); g.userData.photoTree = kind; return g
}
globalThis.FK_PHOTO_TREE = photoTree
const FIRS = ['fir_a', 'fir_b', 'fir_c']
const rp = (t, rx, ry) => { const c = t.clone(); c.repeat.set(Math.max(0.05, rx), Math.max(0.05, ry)); c.needsUpdate = true; return c }
const mapOf = (kind, rx, ry) => PHOTO[kind] ? rp(PHOTO[kind].map, rx, ry) : M([200, 200, 200], { tex: kind === 'snow' ? 'noise' : kind, amt: AMT[kind] ?? null, rep: [Math.max(0.05, rx), Math.max(0.05, ry)] }).map
/**
 * Give every plain-coloured surface under root its texture. Call it once after building props or a set from boxes:
 * texturize(group). To choose a pattern for one mesh, set mesh.userData.tex = 'brick' (etc.) before calling.
 */
export function texturize(root) {
  root.traverse((o) => {
    if (!o.isMesh || o.userData.tx || o.userData.tex === 'none') return
    o.userData.tx = true
    const g = o.geometry, p = g.parameters ?? {}, kind = o.userData.tex ?? (g.type === 'PlaneGeometry' && p.width > 200 ? 'grass' : 'noise'), sc = SCALE[kind] ?? 9
    const fix = (m, rx, ry) => { if (!m?.isMeshStandardMaterial || m.map || m.transparent || m.emissive.getHex() !== 0) return m; const c = m.clone(); c.map = mapOf(kind, rx / sc, ry / sc); if (PHOTO[kind]) { c.normalMap = rp(PHOTO[kind].nor, rx / sc, ry / sc); c.normalScale.set(0.8, 0.8) } c.color.multiplyScalar(kind === 'noise' ? 1.08 : 1.2); return c }
    if (g.type === 'BoxGeometry') {
      const { width: w, height: h, depth: d } = p; if (Math.max(w, h, d) < 1.3 && !o.userData.tex) return
      const src = Array.isArray(o.material) ? o.material : Array(6).fill(o.material), dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
      o.material = src.map((m, i) => fix(m, dims[i][0], dims[i][1]))
    } else if (g.type === 'PlaneGeometry') o.material = fix(o.material, p.width, p.height)
    else if (g.type === 'ExtrudeGeometry') o.material = fix(o.material, 1, 1) // its UVs are already in studs
    else { if (!g.boundingSphere) g.computeBoundingSphere(); const r = g.boundingSphere.radius; if (r < 0.7 && !o.userData.tex) return; const f = (m) => fix(m, Math.max(sc, 5 * r), Math.max(sc, 2.6 * r)); o.material = Array.isArray(o.material) ? o.material.map(f) : f(o.material) }
  })
  return root
}
const rng = (seed) => { let s = 1 + ((seed * 7919) % 2147483646); return () => ((s = (s * 16807) % 2147483647) / 2147483647) }
const pick = (r, a) => a[Math.floor(r() * a.length)]
function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t }
function words(text, w, h, bg, fg, size = 120) { // a flat sign; the text shrinks until it fits
  const lines = String(text).split('\n'), t = tex(1024, Math.round((1024 * h) / w), (g, W, H) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); const fits = () => { g.font = `700 ${size}px Montserrat, sans-serif`; return lines.every((l) => g.measureText(l).width <= W * 0.9) && lines.length * size * 1.2 <= H * 0.92 }; while (!fits() && size > 12) size -= 4; g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * size * 1.2)) })
  return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: t }))
}
const CAR_COLORS = ['#d8433b', '#2f7de8', '#f4f1e8', '#2e9c6a', '#f2c230', '#22242c', '#8d93a3', '#7d5bd6', '#e39a2b', '#19b6a6']
export const VEHICLES = ['sedan', 'hatch', 'pickup', 'van', 'bus', 'taxi', 'police', 'icecream', 'truck']
/** A vehicle, front toward +z, wheels on y 0. kind: one of VEHICLES; color: the body colour (taxi, police, bus and icecream have their own). */
export function vehicle(kind = 'sedan', color = '#d8433b') {
  const g = new T.Group()
  const c = kind === 'taxi' ? '#f2c230' : kind === 'police' ? '#f4f4f4' : kind === 'bus' ? '#f2b233' : kind === 'icecream' ? '#f4f1e8' : color
  const paint = new T.MeshPhysicalMaterial({ color: c, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 }), glassM = new T.MeshPhysicalMaterial({ color: '#16222e', roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }), trimM = mat('#22242c', 0.6), chrome = new T.MeshStandardMaterial({ color: '#d6dbe2', roughness: 0.25, metalness: 0.8 })
  /** A side profile (points from the back, [front-back, height]) pushed out to a width, rounded at the edges. */
  const side = (pts, w, m, bevel = 0.16) => { const sh = new T.Shape(pts.map(([x, y]) => new T.Vector2(x, y))); const geo = new T.ExtrudeGeometry(sh, { depth: w - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 2 }); geo.translate(0, 0, -(w - bevel * 2) / 2); const mesh = new T.Mesh(geo, m); mesh.rotation.y = -Math.PI / 2; mesh.castShadow = mesh.receiveShadow = true; mesh.userData.tex = 'none'; g.add(mesh); return mesh }
  const wheel = (x, z, rr = 0.72) => { const t = new T.Mesh(new T.CylinderGeometry(rr, rr, 0.62, 22), trimM); t.rotation.z = Math.PI / 2; t.position.set(x, rr, z); t.castShadow = true; t.userData.tex = 'none'; const rim = new T.Mesh(new T.CylinderGeometry(rr * 0.58, rr * 0.58, 0.66, 16), chrome); rim.rotation.z = Math.PI / 2; rim.position.set(x, rr, z); rim.userData.tex = 'none'; g.add(t, rim) }
  const lampsAt = (w, y, zf, zb) => { for (const sx of [-1, 1]) { const hl = new T.Mesh(new T.BoxGeometry(0.7, 0.28, 0.12), new T.MeshStandardMaterial({ color: '#fff8dc', emissive: '#fff2c0', emissiveIntensity: 0.6 })); hl.position.set(sx * (w / 2 - 0.55), y, zf); const tl = new T.Mesh(new T.BoxGeometry(0.7, 0.24, 0.12), new T.MeshStandardMaterial({ color: '#d8322c', emissive: '#a01010', emissiveIntensity: 0.4 })); tl.position.set(sx * (w / 2 - 0.55), y, zb); hl.userData.tex = tl.userData.tex = 'none'; g.add(hl, tl) } }
  const bumpers = (w, zf, zb) => { for (const z of [zf, zb]) { const bp = new T.Mesh(new RoundedBoxGeometry(w + 0.1, 0.36, 0.34, 2, 0.12), trimM); bp.position.set(0, 0.62, z); bp.userData.tex = 'none'; g.add(bp) } }
  /** A cabin in body colour with real windows: side glass inset in a paint frame, windscreen and rear glass on the slopes. cab: [[x, y], ...] from the back. */
  const cabin = (cab, W) => {
    side(cab, W - 0.3, paint, 0.1)
    const cx = cab.reduce((a, p) => a + p[0], 0) / cab.length, cy = cab.reduce((a, p) => a + p[1], 0) / cab.length
    const shrink = (k) => cab.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k + (1 - k) * 0.08])
    side(shrink(0.8), W - 0.24, glassM, 0.02) // the side windows: a little proud of the cabin, framed by paint
    side(cab.map(([x, y]) => [cx + (x - cx) * 1.012, y]), W - 0.62, glassM, 0.02) // windscreen and rear window: just past the slopes, paint pillars at the corners
  }
  if (['sedan', 'taxi', 'police', 'hatch'].includes(kind)) {
    const hatch = kind === 'hatch', back = hatch ? -2.9 : -3.7, W = 3.3
    side([[back, 0.42], [3.7, 0.42], [3.72, 1.2], [3.5, 1.55], [1.5, 1.78], [back + (hatch ? 0.3 : 1.3), 1.84], [back + 0.06, hatch ? 1.9 : 1.72], [back, 1.25]], W, paint)
    cabin([[1.55, 1.72], [0.45, 2.7], [hatch ? back + 0.55 : -1.35, 2.74], [hatch ? back + 0.2 : -2.5, 1.78]], W)
    for (const sx of [-1, 1]) { const ln = new T.Mesh(new T.BoxGeometry(0.02, 0.9, 0.04), trimM); ln.position.set(sx * (W / 2 + 0.005), 1.0, hatch ? -0.5 : -0.4); ln.userData.tex = 'none'; g.add(ln); const hd = new T.Mesh(new T.BoxGeometry(0.06, 0.08, 0.36), chrome); hd.position.set(sx * (W / 2 + 0.03), 1.45, hatch ? 0.2 : 0.4); hd.userData.tex = 'none'; g.add(hd) } // a door line and a handle
    bumpers(W, 3.74, back - 0.04); lampsAt(W, 1.3, 3.76, back - 0.06); for (const sx of [-1.5, 1.5]) for (const z of [2.35, back + 1.25]) wheel(sx, z)
    if (kind === 'taxi') { box(g, 1.2, 0.36, 0.5, '#22242c', 0, 2.92, -0.4); const sg = words('TAXI', 1.1, 0.3, '#22242c', '#f2c230'); sg.position.set(0, 2.92, -0.14); g.add(sg); for (const sx of [-1, 1]) for (let i = -4; i <= 4; i++) { const ck = new T.Mesh(new T.BoxGeometry(0.02, 0.18, 0.36), i % 2 ? trimM : new T.MeshBasicMaterial({ color: '#f4f4f4' })); ck.position.set(sx * (W / 2 + 0.01), 1.28, i * 0.36 - 0.4); ck.userData.tex = 'none'; g.add(ck) } }
    if (kind === 'police') { const blue = new T.MeshPhysicalMaterial({ color: '#1c2a4a', roughness: 0.3, clearcoat: 1 }); for (const sx of [-1, 1]) { const st = new T.Mesh(new T.BoxGeometry(0.04, 0.5, 4.6), blue); st.position.set(sx * 1.67, 1.15, 0.3); g.add(st) } box(g, 0.55, 0.26, 0.5, '#d8322c', -0.32, 2.88, -0.45); box(g, 0.55, 0.26, 0.5, '#2f7de8', 0.32, 2.88, -0.45) }
    /** A door that opens: g.userData.door(k), k 0 shut to 1 open (the front left door, toward the pavement when parked facing +z on the near lane). */
    const dg = new T.Group(); dg.position.set(-W / 2 - 0.03, 0, 0.95); g.add(dg)
    const dp = new T.Mesh(new T.BoxGeometry(0.08, 1.2, 1.9), paint); dp.position.set(0, 1.08, -0.95); dg.add(dp); const dwn = new T.Mesh(new T.BoxGeometry(0.06, 0.78, 1.5), glassM); dwn.position.set(0.02, 2.12, -0.95); dg.add(dwn)
    dp.userData.tex = dwn.userData.tex = 'none'; dg.visible = false
    g.userData.door = (k) => { const e = k <= 0 ? 0 : k >= 1 ? 1 : 1 - (1 - k) ** 3; dg.visible = e > 0.001; dg.rotation.y = 1.25 * e * (1 + 0.06 * Math.sin(Math.PI * Math.min(1, k * 1.4))) } // eases open with a small swing past, then settles
  } else if (kind === 'pickup') {
    const W = 3.5
    side([[-4, 0.5], [4, 0.5], [4.02, 1.4], [3.8, 1.75], [1.8, 1.95], [1.7, 1.95], [-0.2, 1.95], [-4, 1.95], [-4, 1.3]], W, paint)
    cabin([[1.8, 1.9], [1.0, 3.02], [-0.25, 3.05], [-0.3, 1.9]], W)
    const bed = new T.Mesh(new T.BoxGeometry(W - 0.5, 0.2, 3.5), trimM); bed.position.set(0, 1.97, -2.2); g.add(bed)
    bumpers(W, 4.04, -4.04); lampsAt(W, 1.5, 4.06, -4.06); for (const sx of [-1.6, 1.6]) for (const z of [2.6, -2.6]) wheel(sx, z, 0.82)
  } else if (kind === 'van' || kind === 'icecream') {
    const W = 3.6
    side([[-4, 0.5], [4.4, 0.5], [4.45, 1.5], [4.1, 2.0], [3.0, 3.4], [2.7, 3.9], [-4, 3.9], [-4, 1]], W, paint, 0.22)
    side([[4.05, 2.05], [3.0, 3.38], [2.6, 3.38], [2.6, 2.05]], W + 0.04, glassM, 0.02); for (const sx of [-1, 1]) { const wn = new T.Mesh(new T.BoxGeometry(0.04, 1.1, 2.6), glassM); wn.position.set(sx * 1.81, 2.9, 0.6); g.add(wn) }
    bumpers(W, 4.5, -4.04); lampsAt(W, 1.5, 4.52, -4.06); for (const sx of [-1.6, 1.6]) for (const z of [2.8, -2.6]) wheel(sx, z)
    if (kind === 'icecream') { const st = new T.Mesh(new T.BoxGeometry(3.64, 0.5, 8.5), new T.MeshPhysicalMaterial({ color: '#ff8fc8', roughness: 0.3, clearcoat: 1 })); st.position.set(0, 1.0, 0.2); g.add(st); const cone = new T.Mesh(new T.ConeGeometry(0.5, 1.2, 12), mat('#e0b27a')); cone.rotation.x = Math.PI; cone.position.set(0, 4.6, -1); const sc = new T.Mesh(new T.SphereGeometry(0.62, 14, 10), mat('#ff8fc8')); sc.position.set(0, 5.4, -1); g.add(cone, sc) }
  } else if (kind === 'bus') {
    const W = 3.9
    side([[-6.6, 0.6], [6.6, 0.6], [6.7, 3.6], [6.4, 4.3], [-6.6, 4.3], [-6.7, 1]], W, paint, 0.25)
    for (const sx of [-1, 1]) { const band = new T.Mesh(new T.BoxGeometry(0.04, 1.3, 11.4), glassM); band.position.set(sx * 1.96, 3.15, -0.4); g.add(band); const st = new T.Mesh(new T.BoxGeometry(0.04, 0.24, 13), trimM); st.position.set(sx * 1.96, 1.6, 0); g.add(st) }
    const ws = new T.Mesh(new T.BoxGeometry(3.5, 1.7, 0.04), glassM); ws.position.set(0, 3.2, 6.7); g.add(ws); bumpers(W, 6.72, -6.72); lampsAt(W, 1.4, 6.74, -6.74); for (const sx of [-1.75, 1.75]) for (const z of [4.4, -4.2]) wheel(sx, z, 0.85)
  } else { // truck: a cab and a box
    const W = 3.6
    side([[1.8, 0.6], [5.4, 0.6], [5.45, 2], [5.2, 3.6], [1.8, 3.6]], W, paint, 0.2); const ws = new T.Mesh(new T.BoxGeometry(3.1, 1.1, 0.04), glassM); ws.position.set(0, 2.9, 5.38); ws.rotation.x = -0.08; g.add(ws)
    const bx = new T.Mesh(new RoundedBoxGeometry(3.8, 3.9, 8.2, 2, 0.12), mat('#f4f1e8')); bx.position.set(0, 2.9, -2.4); bx.castShadow = true; g.add(bx); const ch = new T.Mesh(new T.BoxGeometry(3.4, 0.5, 11), trimM); ch.position.set(0, 0.85, 0.2); g.add(ch)
    bumpers(W, 5.46, -6.5); lampsAt(W, 1.4, 5.48, -6.52); for (const sx of [-1.7, 1.7]) for (const z of [4, -2.6, -4.6]) wheel(sx, z, 0.85)
  }
  g.userData.vehicle = kind // the frame check finds vehicles by this
  return g
}
/** Park seeded vehicles: n of them, each a random kind and colour, at the given [x, z, turn] spots (shuffled). */
function traffic(root, r, spots, n, kinds = VEHICLES) { const sp = spots.slice().sort(() => r() - 0.5).slice(0, n); for (const [x, z, ry] of sp) { const v = OPTS.cars?.length ? model(pick(r, OPTS.cars)) : vehicle(pick(r, kinds), pick(r, CAR_COLORS)); v.position.set(x, -0.2, z); v.rotation.y = ry; root.add(v) } }
function clouds(root, r, n = 7) {
  if (globalThis.FK_SKY) return // the photo sky has real clouds // soft wispy clouds: blurred white puffs on flat cards, high and far
  const t = tex(512, 256, (g, W, H) => { g.filter = 'blur(14px)'; for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.35})`; g.beginPath(); g.ellipse(130 + r() * 250, 118 + r() * 20, 50 + r() * 70, 9 + r() * 12, 0, 0, Math.PI * 2); g.fill() } }) // thin streaks, like the game's sky // puffs stay well inside the card, so the blur never meets its edge
  const m = new T.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false })
  for (let i = 0; i < Math.round(n * 1.4); i++) { const p = new T.Mesh(new T.PlaneGeometry(160 + r() * 140, 34 + r() * 16), m); const a = r() * Math.PI * 2; p.position.set(Math.sin(a) * 320, 90 + r() * 110, -Math.cos(a) * 320); p.lookAt(0, p.position.y * 0.6, 0); p.userData.tex = 'none'; root.add(p) } }
/**
 * Real grass: thousands of little blades plus flowers, the thing that makes a lawn look like the game and not a green
 * floor. area = [x0, x1, z0, z1]; skip(x, z) returns true where nothing should grow (paths, ponds, floors).
 */
export function grassField(root, r, color, area, skip = () => false, per = 1.5) {
  const [x0, x1, z0, z1] = area, n = Math.min(64000, Math.round((x1 - x0) * (z1 - z0) * per * 2.6)), base = new T.Color(color)
  // one tuft = 6 thin flat blades leaning outward; dark at the root, light yellow-green at the tip (vertex colours)
  const P = [], C = [], N = [], tip = new T.Color('#ffffff'), root0 = new T.Color('#a9d6a2')
  for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + r(), d = 0.08 + r() * 0.34, cx = Math.cos(a) * d, cz = Math.sin(a) * d, w = 0.07 + r() * 0.05, h = 0.6 + r() * 0.4, lean = 0.1 + r() * 0.3, px = -Math.sin(a) * w, pz = Math.cos(a) * w
    P.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean)
    for (const c of [root0, root0, tip]) C.push(c.r, c.g, c.b); N.push(0, 1, 0, 0, 1, 0, 0, 1, 0) }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(C, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(N, 3))
  const blades = new T.InstancedMesh(geo, new T.MeshStandardMaterial({ roughness: 0.85, side: T.DoubleSide, vertexColors: true }), n), m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3(), c = new T.Color()
  const bright = base.clone().lerp(new T.Color('#a8e08c'), 0.55) // the tips: lighter and a little yellow
  let k = 0
  for (let i = 0; i < n; i++) { const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0); if (skip(x, z)) continue; const h = 0.34 + r() * 0.36, wd = 0.9 + r() * 0.5; e.set(0, r() * 6.28, 0); q.setFromEuler(e); m.compose(v.set(x, -0.02, z), q, sc.set(wd, h, wd)); blades.setMatrixAt(k, m); blades.setColorAt(k, c.copy(bright).offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.1)); k++ }
  blades.count = k; blades.receiveShadow = true; blades.userData.tex = 'none'; blades.frustumCulled = false; root.add(blades)
  const fn = Math.round(n / 120), fl = new T.InstancedMesh(new T.BoxGeometry(0.2, 0.2, 0.2), new T.MeshStandardMaterial({ roughness: 0.6 }), fn), cols = ['#f6b7d6', '#f3dc8a', '#ffffff', '#f2c79a', '#d9c2f5', '#ffffff']
  let j = 0
  for (let i = 0; i < fn; i++) { const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0); if (skip(x, z)) continue; e.set(r(), r() * 6, r()); q.setFromEuler(e); m.compose(v.set(x, 0.3 + r() * 0.25, z), q, sc.set(1, 1, 1)); fl.setMatrixAt(j, m); fl.setColorAt(j, c.set(cols[Math.floor(r() * cols.length)])); j++ }
  fl.count = j; fl.userData.tex = 'none'; fl.frustumCulled = false; root.add(fl)
  return blades
}
/** A pine: a trunk and three stacked cones. snow: true dusts it white. */
export function pine(x, z, s = 1, snow = false) {
  if (!snow && globalThis.FK_TREES) { const k = Math.abs(Math.round(x * 7 + z * 13)) % 3, p = photoTree(FIRS[k], x, z, 15 * s * (0.85 + (k % 2) * 0.3), '#ffffff', x + z); if (p) return p }
  const g = new T.Group(); box(g, 0.9 * s, 3 * s, 0.9 * s, '#5d4330', 0, 1.5 * s, 0)
  for (let i = 0; i < 3; i++) { const c = new T.Mesh(new T.ConeGeometry((3.4 - i * 0.8) * s, 3.6 * s, 9), mat(snow ? ['#5f7f74', '#8fa9a0', '#e9f0f5'][i] : ['#1f6b44', '#24804f', '#2c9a5c'][i], 0.9)); c.position.y = (3.6 + i * 2.2) * s; c.castShadow = true; g.add(c) }
  g.position.set(x, 0, z); return g
}
/** Fill the horizon so no frame ends in a bare line: a ring of hills, tree lines and far roofs. inner = how far out it starts. */
export function backdrop(root, r, TH, inner = 70, snowy = false) {
  const mark = (o) => { o.userData.backdrop = true; return o }
  if (globalThis.FK_TREES && !snowy) { // the shorts' horizon: a dense wall of real firs (several rows), no cartoon hills or pastel houses
    for (let row = 0; row < 3; row++) { const n = 70 + row * 30; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + r() * 0.08, dist = inner + row * 16 + r() * 10, x = 10 + Math.sin(a) * dist, z = -50 + Math.cos(a) * dist; if (z > 10 && Math.abs(x - 10) < 40) continue; const t = photoTree(FIRS[Math.floor(r() * 3)], x, z, 26 + r() * 16 + row * 4, row ? '#d4dccf' : '#ffffff', r() * 6); if (t) root.add(mark(t)) } }
    return
  }
  const shade = (k) => { const c = new T.Color(TH.grass); c.multiplyScalar(k); return '#' + c.getHexString() }
  const nh = 12 + Math.floor(r() * 6); for (let i = 0; i < nh; i++) { const a = (i / nh) * Math.PI * 2 + r() * 0.4, dist = inner + 40 + r() * 70, rad = 34 + r() * 40, hh = 16 + r() * 34; const m = new T.Mesh(new T.SphereGeometry(rad, 28, 14), mat(shade(0.78 + r() * 0.3), 0.95)); m.scale.y = hh / rad; m.position.set(10 + Math.sin(a) * dist, -2, -50 + Math.cos(a) * dist); m.userData.tex = snowy ? 'snow' : 'grass'; root.add(mark(m)) }
  const nt = 46 + Math.floor(r() * 30), pines = r(); for (let i = 0; i < nt; i++) { const a = r() * Math.PI * 2, dist = inner + r() * 46, x = 10 + Math.sin(a) * dist, z = -50 + Math.cos(a) * dist; if (z > -4) continue; root.add(mark(snowy || r() < pines ? pine(x, z, 1.3 + r() * 1.2, snowy) : tree(x, z, 1 + r() * 1.3, r() < 0.5 ? TH.leaf : shade(0.8)))) }
  const pastel = [['#f3f0c8', '#9fd6a0'], ['#ffffff', '#bfe3ff'], ['#ffd9a8', '#ff9c5a'], ['#cfe9ff', '#7fb6ff'], ['#f6c9d8', '#e88aa8']]
  for (let i = 0; i < 12; i++) { const a = r() * Math.PI * 2, dist = inner + 6 + r() * 30, [wall, roof] = pick(r, pastel); if (-50 + Math.cos(a) * dist > -4) continue; root.add(mark(house(10 + Math.sin(a) * dist, -50 + Math.cos(a) * dist, { wall, roof, w: 12 + r() * 6, h: 8 + r() * 5, turn: a + Math.PI }))) }
}
/** The sky, the two lights, the fog and mood(name, at), shared by every outdoor world. */
export function daylight(root, TH) {
  const top = new T.Color(TH.sky[0]), hor = new T.Color(TH.sky[1]).lerp(new T.Color('#ffffff'), 0.5)
  // the game's sky: deep azure straight up, a long smooth fade, a bright almost-white band at the horizon
  const dome = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 512; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512), mid = top.clone().lerp(hor, 0.45)
    gr.addColorStop(0, '#' + top.clone().multiplyScalar(0.86).getHexString()); gr.addColorStop(0.42, '#' + top.getHexString()); gr.addColorStop(0.7, '#' + mid.getHexString()); gr.addColorStop(0.86, '#' + hor.getHexString()); gr.addColorStop(1, '#' + hor.getHexString()); g.fillStyle = gr; g.fillRect(0, 0, 4, 512)
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; const photo = globalThis.FK_SKY && !TH.lit; const m = new T.Mesh(new T.SphereGeometry(400, 48, 32), new T.MeshBasicMaterial({ map: t, side: T.BackSide, fog: false })); if (photo) { m.userData.skyDome = true; root.userData.photoSky = true } m.position.y = -60; m.userData.tex = 'none'; return m })(); root.add(dome)
  const glow = new T.Mesh(new T.CircleGeometry(60, 32), new T.MeshBasicMaterial({ map: tex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,252,235,0.95)'); gr.addColorStop(0.12, 'rgba(255,250,230,0.6)'); gr.addColorStop(1, 'rgba(255,250,230,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128) }), transparent: true, depthWrite: false, fog: false })); glow.position.set(-230, 210, 160); glow.lookAt(0, 0, 0); glow.userData.tex = 'none'; root.add(glow) // the sun's glow
  const hemi = new T.HemisphereLight('#c4d6ff', '#9aa88f', TH.hemi[1] * 0.75); root.add(hemi) // cool sky light: shadows lean blue, like the game
  const sun = new T.DirectionalLight(new T.Color(TH.sun[0]).lerp(new T.Color('#ffe2b8'), 0.35), TH.sun[1] * 2.2); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.radius = 6; sun.shadow.blurSamples = 16; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 160 }); root.add(sun, sun.target)
  const fog = new T.Fog('#' + hor.getHexString(), 140, 620) // only far things fade; nothing near the camera goes milky
  const mood = (name, at = [0, 0, 0]) => {
    const dusk = name === 'dusk'
    hemi.intensity = (dusk ? 0.85 : 1) * TH.hemi[1] * 0.75; hemi.color.set(dusk ? '#ffe6cf' : '#c4d6ff'); sun.color.set(dusk ? '#ffb37a' : '#fff1dc'); sun.intensity = TH.sun[1] * (dusk ? 2.4 : 2.2)
    const o = dusk ? [-40, 16, 20] : [-30, 28, 22]; sun.position.set(at[0] + o[0], at[1] + o[1], at[2] + o[2]); sun.target.position.set(...at); sun.target.updateMatrixWorld()
    fog.color.set(dusk ? '#f4c9a4' : '#' + hor.getHexString()); dome.material.color.set(dusk ? '#f6d2c4' : '#ffffff')
  }
  mood('day')
  return { sun, hemi, fog, mood }
}

// ---------------------------------------------------------------- a family home (front faces +z)
/**
 * A family home (front faces +z), modelled like the houses in the game's showcase maps: siding or brick walls on a
 * stone base, real windows (white frames, sills, a cross bar, glass with blinds or dark panes), a panelled door under a
 * frame, porch steps, white corner boards, a roof with overhang, fascia and gutters, a downspout, a chimney and maybe a
 * garage. o: { w, h, wall, roof, tex: 'siding' | 'brick' | 'stone' }. Call texturize(home) after adding it yourself.
 */
export function home(r, TH, o = {}) {
  const w = o.w ?? 13 + Math.floor(r() * 4), h = o.h ?? 7 + Math.floor(r() * 2) * 1.5, d = 10, wall = o.wall ?? pick(r, TH.walls), roofC = o.roof ?? pick(r, ['#4a4f58', '#5a4a48', '#6b3a32', '#3f4f66', '#4f5a4a', '#2f3440']), doorC = pick(r, ['#b8322c', '#2f5f9e', '#2e7a55', '#f4f1e8', '#5a3d28', '#22242c'])
  const g = new T.Group(), trim = '#f4f2ec', F = d / 2, wk = o.tex ?? pick(r, ['siding', 'siding', 'siding', 'brick', 'stone'])
  const glassM = new T.MeshStandardMaterial({ color: TH.lit ? '#ffcf7a' : '#2c3a48', emissive: TH.lit ? '#ffb85a' : '#000000', emissiveIntensity: TH.lit ? 1.6 : 0, roughness: 0.12, metalness: 0 })
  const blindsM = new T.MeshStandardMaterial({ color: TH.lit ? '#ffe2a8' : '#e9e6de', emissive: TH.lit ? '#ffc070' : '#000000', emissiveIntensity: TH.lit ? 1.2 : 0, roughness: 0.9 })
  const b = (pw, ph, pd, c, x, y, z, k) => box(g, pw, ph, pd, c, x, y, z, k)
  const body = b(w, h, d, wall, 0, h / 2, 0, wk)
  b(w + 0.24, 1.1, d + 0.24, pick(r, ['#9a948a', '#8a8278', '#a8a29a']), 0, 0.55, 0, 'stone') // the stone base
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b(0.34, h - 1.1, 0.34, trim, sx * (w / 2 + 0.02), (h + 1.1) / 2, sz * (F + 0.02)) // corner boards
  b(w + 0.3, 0.3, d + 0.3, trim, 0, h - 0.15, 0) // the frieze board under the eaves
  /** A window on the front: frame, sill, glass, a cross bar, and blinds pulled down part way (or not). */
  const win = (x, y, ww, hh) => {
    const fz = F + 0.08, t = 0.22
    b(ww + 2 * t, t, 0.2, trim, x, y + hh / 2 + t / 2, fz); b(ww + 2 * t, t, 0.2, trim, x, y - hh / 2 - t / 2, fz)
    b(t, hh, 0.2, trim, x - ww / 2 - t / 2, y, fz); b(t, hh, 0.2, trim, x + ww / 2 + t / 2, y, fz)
    b(ww + 0.9, 0.18, 0.5, trim, x, y - hh / 2 - t - 0.06, F + 0.25) // sill
    const gl = new T.Mesh(new T.PlaneGeometry(ww, hh), glassM); gl.position.set(x, y, F + 0.03); gl.userData.tex = 'none'; g.add(gl)
    const down = r() < 0.6 ? 0.35 + r() * 0.5 : 0; if (down) { const bl = new T.Mesh(new T.PlaneGeometry(ww, hh * down), blindsM); bl.position.set(x, y + hh / 2 - (hh * down) / 2, F + 0.04); bl.userData.tex = 'none'; g.add(bl) }
    b(0.12, hh, 0.1, trim, x, y, F + 0.06); b(ww, 0.12, 0.1, trim, x, y + (r() < 0.5 ? 0 : hh * 0.18), F + 0.06) // the bars
    if (r() < 0.35) for (const sx of [-1, 1]) b(0.7, hh + 0.3, 0.1, pick(r, ['#2f3440', '#3f5a7a', '#5a3d28', '#2e5a44']), x + sx * (ww / 2 + t + 0.4), y, F + 0.06) // shutters
  }
  const dx = (r() - 0.5) * (w - 7) * 0.6
  // the door: frame, a panelled door, a knob, a light beside it, and two steps
  b(3.0, 5.3, 0.22, trim, dx, 2.65 + 0.4, F + 0.08); const door = b(2.3, 4.7, 0.16, doorC, dx, 2.35 + 0.4, F + 0.16)
  for (const yy of [1.6, 3.6]) b(1.6, 1.3, 0.06, new T.Color(doorC).multiplyScalar(0.82).getStyle(), dx, yy + 0.4, F + 0.25)
  b(0.2, 0.2, 0.2, '#d9b54a', dx + 0.8, 2.6, F + 0.3)
  const lamp = new T.Mesh(new T.BoxGeometry(0.4, 0.6, 0.3), new T.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffd890', emissiveIntensity: TH.lit ? 2.2 : 0.2 })); lamp.position.set(dx + 2.1, 4.3, F + 0.25); lamp.userData.tex = 'none'; g.add(lamp)
  b(4.2, 0.4, 1.4, '#c9c4ba', dx, 0.2, F + 0.7, 'concrete'); b(4.2, 0.4, 0.9, '#c9c4ba', dx, 0.6, F + 0.45, 'concrete')
  for (const x of [-w / 2 + 2.6, w / 2 - 2.6]) if (Math.abs(x - dx) > 3.6) win(x, 3.2, 2.6, 2.6)
  if (h > 8) for (let x = -w / 2 + 2.4; x <= w / 2 - 2.4; x += Math.max(3.6, (w - 4.8) / Math.max(1, Math.round((w - 4.8) / 4)))) win(x, h - 2.6, 2.2, 2.2)
  // the roof: overhang, fascia boards and a gutter along the front, a downspout at the corner
  const side = r() < 0.6, rh = 2.6 + r() * 1.6, ov = 0.9, roofM = mat(roofC, 0.9)
  if (side) { // ridge along the street: the slope faces the camera
    const sh = new T.Shape([new T.Vector2(-F - ov, 0), new T.Vector2(F + ov, 0), new T.Vector2(0, rh)])
    const roof = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: w + 2 * ov, bevelEnabled: false }), roofM); roof.rotation.y = Math.PI / 2; roof.position.set(-w / 2 - ov, h, 0); roof.castShadow = true; roof.userData.tex = 'shingle'; g.add(roof)
    b(w + 2 * ov, 0.4, 0.16, trim, 0, h - 0.05, F + ov); b(w + 2 * ov, 0.32, 0.34, trim, 0, h - 0.34, F + ov + 0.2) // fascia + gutter
    for (const sx of [-1, 1]) { const gb = new T.Shape([new T.Vector2(-F - ov, 0), new T.Vector2(F + ov, 0), new T.Vector2(0, rh)]); const end = new T.Mesh(new T.ShapeGeometry(gb), mat(wall)); end.rotation.y = Math.PI / 2; end.position.set(sx * (w / 2), h, 0); end.scale.set(0.98, 0.98, 1); end.userData.tex = wk; g.add(end) }
  } else { // gable facing the street
    const sh = new T.Shape([new T.Vector2(-w / 2 - ov, 0), new T.Vector2(w / 2 + ov, 0), new T.Vector2(0, rh)])
    const roof = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: d + 2 * ov, bevelEnabled: false }), roofM); roof.position.set(0, h, -F - ov); roof.castShadow = true; roof.userData.tex = 'shingle'; g.add(roof)
    const gable = new T.Mesh(new T.ShapeGeometry(new T.Shape([new T.Vector2(-w / 2, 0), new T.Vector2(w / 2, 0), new T.Vector2(0, rh * (w / 2) / (w / 2 + ov))])), mat(wall)); gable.position.set(0, h, F + 0.01); gable.userData.tex = wk; g.add(gable)
    const ang = Math.atan2(rh, w / 2 + ov), len = Math.hypot(rh, w / 2 + ov)
    for (const sx of [-1, 1]) { const fb = b(len, 0.4, 0.2, trim, sx * (w / 2 + ov) / 2, h + rh / 2, F + ov + 0.05); fb.rotation.z = -sx * ang }
    if (r() < 0.6) win(0, h + rh * 0.32, 1.6, 1.6)
  }
  const ds = b(0.3, h, 0.3, trim, (r() < 0.5 ? -1 : 1) * (w / 2 + 0.25), h / 2, F + 0.3); ds.castShadow = false // downspout
  b(1.4, 3.2, 1.4, pick(r, ['#8a5a48', '#7a6e66', '#9a4a3a']), w * 0.28, h + rh * 0.6, -1.2, 'brick') // chimney
  if (r() < 0.55) { const gx = (r() < 0.5 ? -1 : 1) * (w / 2 + 3.3); b(6.6, 5.2, 8, wall, gx, 2.6, -1, wk); b(7.4, 0.4, 8.8, roofC, gx, 5.3, -1, 'shingle'); b(5.4, 4, 0.2, trim, gx, 2.1, 3.06); for (let y = 0.6; y < 4; y += 0.8) b(5.4, 0.08, 0.26, '#d8d5cc', gx, y, 3.12); b(5.6, 0.3, 4, '#bdb8ae', gx, 0.05, 5, 'concrete') } // a garage + driveway
  for (let k = 0; k < 2 + Math.floor(r() * 3); k++) { const bs = new T.Mesh(new T.SphereGeometry(0.7 + r() * 0.5, 12, 10), mat(pick(r, ['#3f7a3a', '#4f8a3f', '#2f6a35']), 0.95)); bs.scale.y = 0.75; bs.position.set(-w / 2 + 1 + r() * (w - 2), 0.6, F + 1.2); if (Math.abs(bs.position.x - dx) < 2.8) continue; bs.castShadow = true; bs.userData.tex = 'grass'; g.add(bs) } // shrubs along the front
  return g
}

// ---------------------------------------------------------------- suburb: a quiet street of family homes with lawns
// Same layout as the city so shots carry over: the near pavement is x -3.5..3.5, the road x 3.5..17.5 (y -0.2), the
// street runs z +40..-150. Lawns start at x -3.6 (walkable, y 0) and the homes sit 10 studs back, so the sky is wide open.
function suburb(TH, seed) {
  const root = new T.Group(), r = rng(seed), L = 200, zc = -55, snowy = TH === CITY_THEMES.snow, pines = r() < 0.35, paths = []
  const grass = new T.Mesh(new T.PlaneGeometry(900, 900), mat(TH.grass, 0.95)); grass.rotation.x = -Math.PI / 2; grass.position.y = -0.5; grass.receiveShadow = true; grass.userData.tex = snowy ? 'snow' : 'grass'; root.add(grass)
  for (const [x, w] of [[-103.5, 200], [124.5, 200]]) { const lawn = box(root, w, 0.4, L + 60, TH.grass, x, -0.22, zc, snowy ? 'snow' : 'grass'); lawn.castShadow = false } // the lawns: slabs level with the pavement
  box(root, 14, 0.2, L, TH.road, 10.5, -0.3, zc, 'asphalt').castShadow = false
  for (const x of [0, 21]) box(root, 7, 0.4, L, TH.pave, x, -0.2, zc, 'tiles').castShadow = false
  for (let z = 30; z > -150; z -= 9) box(root, 0.3, 0.04, 4, '#f4f4f0', 10.5, -0.18, z).castShadow = false
  for (const [side, x0] of [[1, -3.6], [-1, 24.6]]) {
    let z = 30 - r() * 8
    while (z > -150) {
      const hid = OPTS.houses?.length ? pick(r, OPTS.houses) : null, hs = hid ? modelInfo(hid).size_m ?? { x: 10, z: 10 } : null // a Polyfork house the story picked, or our own
      const lot = hid ? Math.max(17, hs.x * STUDS_PER_M + 5) : 17 + Math.floor(r() * 6), cz = z - lot / 2, hx = x0 - side * (hid ? hs.z * STUDS_PER_M / 2 + 7 + r() * 2 : 11 + r() * 3)
      const h = hid ? model(hid, { night: !!TH.lit }) : home(r, TH, { h: pick(r, [7.5, 9, 11, 12, 12]), w: 11 + Math.floor(r() * 4) }); h.position.set(hx, 0, cz); h.rotation.y = (side * Math.PI) / 2; root.add(h)
      const pz = cz + (r() - 0.5) * 6; paths.push([Math.min(hx, x0), Math.max(hx, x0), pz - 2.2, pz + 2.2], [hx - 9, hx + 9, cz - 9, cz + 9]); box(root, Math.abs(hx - x0) - 4, 0.06, 3.2, TH.pave, (hx + x0) / 2 + side * 2, 0.03, pz, 'cobble').castShadow = false // the path to the door
      const deco = r()
      if (deco < 0.45) for (let k = 0; k < lot - 6; k += 0.9) { if (Math.abs(k - lot / 2 + 3) < 2.4) continue; box(root, 0.16, 1.5, 0.5, '#f4f1e8', x0 - side * 0.5, 0.75, z - 3 - k) } // a picket fence
      else if (deco < 0.75) box(root, 1.4, 1.6, lot - 9, globalThis.FK_TREES ? '#3d6b34' : TH.leaf, x0 - side * 1.2, 0.8, cz + 5, 'grass') // a hedge
      for (let k = 0; k < 1 + Math.floor(r() * 2); k++) { const tx = x0 - side * (4 + r() * 3), tz = z - 2 - r() * (lot - 4); if (Math.abs(tz - pz) > 3) root.add(snowy || pines ? pine(tx, tz, 0.9 + r() * 0.5, snowy) : tree(tx, tz, 0.6 + r() * 0.5, TH.leaf)) }
      if (r() < 0.6) for (let k = 0; k < 3; k++) { const bs = new T.Mesh(new T.SphereGeometry(0.9 + r() * 0.5, 12, 10), mat(TH.leaf, 0.9)); bs.scale.y = 0.75; bs.position.set(hx + side * 5.6, 0.7, cz - 3 + k * 2.4); bs.castShadow = true; root.add(bs) } // bushes under the windows
      if (r() < 0.6) { const mb = new T.Group(); box(mb, 0.2, 1.8, 0.2, '#6b4a34', 0, 0.9, 0); box(mb, 0.6, 0.5, 1, pick(r, ['#d8433b', '#2f7de8', '#f4f1e8']), 0, 2, 0); mb.position.set(x0 - side * 0.7, 0, z - lot + 4); root.add(mb) }
      z -= lot
    }
  }
  for (let z = 6; z > -140; z -= 44) { const p = new T.Group(); box(p, 0.5, 13, 0.5, '#6b4a34', 0, 6.5, 0); box(p, 3.6, 0.3, 0.3, '#6b4a34', 0, 12, 0); p.position.set(18.6, 0, z); root.add(p); const wire = box(root, 0.06, 0.06, 44, '#22242c', 17.2, 11.8, z - 22); wire.castShadow = false; const w2 = box(root, 0.06, 0.06, 44, '#22242c', 20, 11.8, z - 22); w2.castShadow = false } // power poles and wires on the far side
  for (let z = 22; z > -140; z -= 30) { const l = new T.Group(); box(l, 0.3, 8, 0.3, '#2b2f38', 0, 4, 0); box(l, 1.6, 0.2, 0.2, '#2b2f38', 0.7, 8, 0); const hd = new T.Mesh(new T.BoxGeometry(0.8, 0.26, 0.5), new T.MeshStandardMaterial({ color: '#fff4c8', emissive: '#ffd890', emissiveIntensity: TH.lit ? 2.4 : 0 })); hd.position.set(1.4, 7.84, 0); l.add(hd); l.position.set(3.1, 0, z); root.add(l) } // street lamps on the kerb
  for (const zz of [-10, -70, -120]) for (let i = 0; i < 7; i++) box(root, 1.2, 0.04, 4.4, '#f4f4f0', 4.9 + i * 1.86, -0.18, zz).castShadow = false // crossings
  if (!globalThis.FK_TREES) box(root, 60, 30, 4, pick(r, TH.walls), 10, 15, -152, 'brick'); backdrop(root, r, TH, 62, snowy)
  traffic(root, r, [[5.3, -24 - r() * 8, 0], [5.3, -52 - r() * 8, 0], [5.3, -84 - r() * 8, 0], [15.7, -20 - r() * 8, Math.PI], [15.7, -36 - r() * 8, Math.PI], [15.7, -70 - r() * 8, Math.PI], [5.3, -110 - r() * 10, 0], [5.3, -126, 0], [15.7, -100 - r() * 8, Math.PI]], 4 + Math.floor(r() * 4), ['sedan', 'sedan', 'hatch', 'pickup', 'van', 'taxi', 'police', 'icecream', 'bus'])
  // street things, different on every street: a hydrant, a bus stop, a hoop, a swing, bins
  const things = { hydrant: () => { const g = new T.Group(); box(g, 0.6, 1.2, 0.6, '#d8322c', 0, 0.6, 0); box(g, 1, 0.3, 0.3, '#d8322c', 0, 0.8, 0); box(g, 0.7, 0.2, 0.7, '#a8231c', 0, 1.3, 0); return g },
    busstop: () => { const g = new T.Group(); for (const x of [-1.6, 1.6]) box(g, 0.2, 4.6, 0.2, '#3a3a40', x, 2.3, 0); box(g, 3.8, 0.2, 1.8, '#2f7de8', 0, 4.7, 0.5); box(g, 3.4, 2.6, 0.1, '#bfe3ff', 0, 2.8, -0.1); box(g, 3, 0.2, 0.8, '#a07c56', 0, 1.3, 0.4); const sg = words('BUS', 1.4, 0.8, '#2f7de8', '#ffffff'); sg.position.set(0, 5.4, 0.5); g.add(sg); return g },
    hoop: () => { const g = new T.Group(); box(g, 0.3, 7, 0.3, '#3a3a40', 0, 3.5, 0); box(g, 2.6, 1.8, 0.14, '#f4f1e8', 0, 7.2, 0.4); const rg = new T.Mesh(new T.TorusGeometry(0.6, 0.06, 8, 20), mat('#e2574c')); rg.rotation.x = Math.PI / 2; rg.position.set(0, 6.6, 1.1); g.add(rg); return g },
    swing: () => { const g = new T.Group(); for (const x of [-2.2, 2.2]) { box(g, 0.25, 6, 0.25, '#d8322c', x, 3, 0.8).rotation.x = 0.26; box(g, 0.25, 6, 0.25, '#d8322c', x, 3, -0.8).rotation.x = -0.26 } box(g, 4.8, 0.25, 0.25, '#d8322c', 0, 5.8, 0); for (const x of [-1, 1]) { box(g, 0.06, 4, 0.06, '#3a3a40', x - 0.4, 3.8, 0); box(g, 0.06, 4, 0.06, '#3a3a40', x + 0.4, 3.8, 0); box(g, 1, 0.14, 0.5, '#2f7de8', x, 1.8, 0) } return g },
    bins: () => { const g = new T.Group(); for (const [x, c] of [[-0.7, '#2e9c6a'], [0.7, '#2f7de8']]) { box(g, 1, 1.9, 1, c, x, 0.95, 0); box(g, 1.1, 0.16, 1.1, '#22242c', x, 1.98, 0) } return g } }
  const names = Object.keys(things).sort(() => r() - 0.5).slice(0, 2 + Math.floor(r() * 3))
  names.forEach((nm, i) => { const g = things[nm](), far = nm === 'swing' || nm === 'hoop'; g.position.set(far ? -9 - r() * 4 : nm === 'busstop' ? 22.6 : -2.6, 0, 10 - i * 26 - r() * 12); if (nm === 'busstop') g.rotation.y = -Math.PI / 2; if (far) paths.push([g.position.x - 3.5, g.position.x + 3.5, g.position.z - 3, g.position.z + 3]); root.add(g) })
  if (!snowy && !globalThis.FK_TREES) { const skip = (x, z) => (x > -3.7 && x < 24.7) || paths.some(([a, b, c, d]) => x > a && x < b && z > c && z < d); grassField(root, r, TH.grass, [-34, 56, -110, 34], skip, 1.25) }
  clouds(root, r)
  return root
}

// ---------------------------------------------------------------- meadow: open green land with hills, a path, a pond
// Flat ground (y 0) for 45 studs around the origin; a dirt path runs along z at x -2..2; a pond at (17, -16);
// a wooden fence at z -30; hills and a few small houses far away.
function meadow(TH, seed) {
  const root = new T.Group(), r = rng(seed), snowy = TH === CITY_THEMES.snow, keep = [] // keep: circles [x, z, radius] where no grass grows
  const grass = new T.Mesh(new T.PlaneGeometry(900, 900), mat(TH.grass, 0.95)); grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; grass.userData.tex = snowy ? 'snow' : 'grass'; root.add(grass)
  const shade = (k) => { const c = new T.Color(TH.grass); c.multiplyScalar(k); return '#' + c.getHexString() }
  const nh = 5 + Math.floor(r() * 7); for (let i = 0; i < nh; i++) { const a = (i / nh) * Math.PI * 2 + r(), dist = 85 + r() * 70, rad = 30 + r() * 36, hh = 10 + r() * 28; const m = new T.Mesh(new T.SphereGeometry(rad, 32, 16), mat(shade(0.82 + r() * 0.3), 0.95)); m.scale.y = hh / rad; m.position.set(Math.sin(a) * dist, -1, Math.cos(a) * dist - 30); m.receiveShadow = true; m.userData.tex = snowy ? 'snow' : 'grass'; root.add(m) }
  // the path: straight, a crossing, or none (seed)
  const pathKind = pick(r, ['straight', 'straight', 'cross', 'none']), px = pathKind === 'none' ? 999 : 0, pathC = pick(r, ['#c9a878', '#b9b3aa', '#d9c9a0'])
  if (pathKind !== 'none') box(root, 4, 0.06, 240, pathC, 0, 0.02, -60, 'asphalt').castShadow = false
  const crossZ = -10 - r() * 14; if (pathKind === 'cross') box(root, 120, 0.06, 4, pathC, 0, 0.025, crossZ, 'asphalt').castShadow = false
  // water: a pond somewhere, a stream, or none
  const water = pick(r, ['pond', 'pond', 'stream', 'none']), wx = (r() < 0.5 ? -1 : 1) * (13 + r() * 8), wz = -8 - r() * 16, wr = 5 + r() * 4
  const wm = new T.MeshStandardMaterial({ color: '#4aa8e8', roughness: 0.15 })
  if (water === 'pond') { const pond = new T.Mesh(new T.CylinderGeometry(wr, wr, 0.1, 40), wm); pond.position.set(wx, 0.04, wz); pond.userData.tex = 'none'; root.add(pond); keep.push([wx, wz, wr + 0.8]); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const st = new T.Mesh(new T.SphereGeometry(0.7 + r() * 0.4, 10, 8), mat('#a9adb5')); st.scale.y = 0.6; st.position.set(wx + Math.sin(a) * (wr + 0.4), 0.2, wz + Math.cos(a) * (wr + 0.4)); st.castShadow = true; root.add(st) } }
  if (water === 'stream') { const st = new T.Mesh(new T.BoxGeometry(5, 0.1, 240), wm); st.position.set(wx * 1.3, 0.04, -60); st.userData.tex = 'none'; root.add(st); const bx = wx * 1.3; box(root, 7, 0.4, 3.4, '#a07c56', bx, 0.5, -6, 'planks'); for (const dz of [-1.6, 1.6]) box(root, 7, 0.9, 0.2, '#8a6a4a', bx, 1.1, -6 + dz) }
  const wet = (x, z) => water === 'stream' && Math.abs(x - wx * 1.3) < 3.2
  // the fence: at a seeded depth, or none
  const fz = pick(r, [-30, -24, -38, null, null]); if (fz) for (let x = -46; x <= 46; x += 4) { if (Math.abs(x - px) < 3) continue; box(root, 0.35, 2, 0.35, '#8a6a4a', x, 1, fz); if (x < 46 && Math.abs(x + 4 - px) >= 3 && Math.abs(x + 2 - px) > 2) for (const y of [0.8, 1.6]) box(root, 4, 0.2, 0.16, '#a07c56', x + 2, y, fz) }
  // one landmark that only this meadow has
  const L = { windmill: () => { const g = new T.Group(); const tw = new T.Mesh(new T.CylinderGeometry(2.4, 3.6, 13, 8), mat('#f4f1e8')); tw.position.y = 6.5; tw.castShadow = true; tw.userData.tex = 'stone'; g.add(tw); const cp = new T.Mesh(new T.ConeGeometry(3, 3, 8), mat('#a8503a')); cp.position.y = 14.5; g.add(cp); for (let i = 0; i < 4; i++) { const bl = box(g, 1.4, 9, 0.2, '#e8e2d2', 0, 11, 2.7); bl.geometry.translate(0, 4.5, 0); bl.rotation.z = (i * Math.PI) / 2 + 0.4 } box(g, 1.6, 3, 0.2, '#6b4a34', 0, 1.5, 3.5); return g },
    barn: () => { const g = new T.Group(); box(g, 16, 9, 12, '#b5433a', 0, 4.5, 0, 'planks'); const sh = new T.Shape([new T.Vector2(-8.7, 0), new T.Vector2(8.7, 0), new T.Vector2(0, 5)]); const rf = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 13.2, bevelEnabled: false }), mat('#5a4a48')); rf.userData.tex = 'shingle'; rf.position.set(0, 9, -6.6); rf.castShadow = true; g.add(rf); box(g, 5, 6, 0.3, '#f4f1e8', 0, 3, 6.1); box(g, 4.4, 5.4, 0.34, '#8a3a32', 0, 2.7, 6.12); for (let i = 0; i < 3; i++) { const hb = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, 2.2, 16), mat('#e0c070')); hb.rotation.z = Math.PI / 2; hb.position.set(11 + (i % 2) * 2.4, 1.4, 2 + i * 2.6); hb.castShadow = true; g.add(hb) } return g },
    tent: () => { const g = new T.Group(); const c1 = pick(r, ['#d8433b', '#2f7de8', '#f2b233']); const t = new T.Mesh(new T.ConeGeometry(5, 6, 4), mat(c1)); t.rotation.y = Math.PI / 4; t.position.y = 3; t.castShadow = true; t.userData.tex = 'fabric'; g.add(t); box(g, 1.6, 3, 0.2, '#22242c', 0, 1.5, 3.4); for (let i = 0; i < 5; i++) { const lg = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 2.4, 10), mat('#6b4a34')); lg.rotation.z = Math.PI / 2; lg.rotation.y = i * 1.26; lg.position.set(8, 0.3, 2); g.add(lg) } const fire = new T.Mesh(new T.ConeGeometry(0.7, 1.6, 8), new T.MeshStandardMaterial({ color: '#ff8a2a', emissive: '#ff6a00', emissiveIntensity: 2 })); fire.position.set(8, 1.2, 2); fire.userData.tex = 'none'; g.add(fire); return g },
    well: () => { const g = new T.Group(); const w = new T.Mesh(new T.CylinderGeometry(2, 2, 2.2, 20), mat('#a9adb5')); w.position.y = 1.1; w.castShadow = true; w.userData.tex = 'stone'; g.add(w); for (const x of [-1.8, 1.8]) box(g, 0.3, 4, 0.3, '#6b4a34', x, 3.2, 0); const rf = new T.Mesh(new T.ConeGeometry(3, 1.8, 4), mat('#7b3b34')); rf.rotation.y = Math.PI / 4; rf.position.y = 6; rf.castShadow = true; g.add(rf); box(g, 0.7, 0.8, 0.7, '#8a6a4a', 0, 3.2, 0); return g },
    rocks: () => { const g = new T.Group(); for (let i = 0; i < 6; i++) { const s2 = 1.6 + r() * 3.4, m = new T.Mesh(new T.DodecahedronGeometry(s2, 0), mat('#8d93a3')); m.position.set(r() * 10 - 5, s2 * 0.5, r() * 6 - 3); m.rotation.set(r() * 3, r() * 3, r() * 3); m.castShadow = true; m.userData.tex = 'stone'; g.add(m) } return g },
    orchard: () => { const g = new T.Group(); for (let i = 0; i < 6; i++) { const t = tree((i % 3) * 7 - 7, Math.floor(i / 3) * 8 - 4, 0.8, TH.leaf); for (let k = 0; k < 5; k++) { const ap = new T.Mesh(new T.SphereGeometry(0.4, 8, 6), mat('#d8322c')); ap.position.set(Math.sin(k * 1.3) * 3, 5.2 + (k % 3), Math.cos(k * 1.3) * 3); t.add(ap) } g.add(t) } return g } }
  const lname = pick(r, Object.keys(L)), lm = L[lname](), lx = (r() < 0.5 ? -1 : 1) * (9 + r() * 10) * (water !== 'none' && Math.sign(wx) > 0 ? -1 : 1) * (r() < 0.5 ? 1 : 1), lz = -22 - r() * 16
  lm.position.set(water !== 'none' ? -Math.sign(wx) * Math.abs(lx) : lx, 0, lz); lm.rotation.y = (r() - 0.5) * 0.8; texturize(lm); root.add(lm); keep.push([lm.position.x, lz, 9])
  if (!snowy) grassField(root, r, TH.grass, [-58, 58, -92, 30], (x, z) => Math.abs(x - px) < 2.3 || (pathKind === 'cross' && Math.abs(z - crossZ) < 2.3) || wet(x, z) || keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr), 1.6)
  for (let i = 0; i < 26; i++) { const x = r() * 100 - 50, z = r() * 90 - 70; if (Math.abs(x - px) < 4 || Math.abs(x) < 6 && z > -12 || wet(x, z) || keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr + 1)) continue; if (i % 3) { const bs = new T.Mesh(new T.SphereGeometry(1 + r() * 0.9, 12, 10), mat(i % 2 ? TH.leaf : shade(0.8), 0.9)); bs.scale.y = 0.7; bs.position.set(x, 0.7, z); bs.castShadow = true; root.add(bs) } else { const rk = new T.Mesh(new T.DodecahedronGeometry(0.7 + r() * 1.1, 0), mat('#9a9ea8')); rk.position.set(x, 0.4, z); rk.rotation.set(r() * 3, r() * 3, 0); rk.castShadow = true; rk.userData.tex = 'stone'; root.add(rk) } } // bushes and rocks
  const nt = 22 + Math.floor(r() * 16), pineShare = r(); for (let i = 0; i < nt; i++) { const a = r() * Math.PI * 2, dist = 13 + r() * 50, x = Math.sin(a) * dist, z = Math.cos(a) * dist - 20; if (Math.abs(x - px) < 6 || wet(x, z) || keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr + 4)) continue; root.add(snowy || r() < pineShare * 0.7 ? pine(x, z, 1 + r() * 0.5, snowy) : tree(x, z, 0.8 + r() * 0.9, i % 3 ? TH.leaf : shade(0.8))) }
  const pastel = [['#f3f0c8', '#9fd6a0'], ['#ffffff', '#bfe3ff'], ['#ffd9a8', '#ff9c5a'], ['#cfe9ff', '#7fb6ff'], ['#f6c9d8', '#e88aa8']]
  const nhouse = 4 + Math.floor(r() * 4); for (let i = 0; i < nhouse; i++) { const [wall, roof] = pastel[Math.floor(r() * pastel.length)], side = i % 2 ? 1 : -1; root.add(house(side * (26 + r() * 22), -36 - i * 13 + r() * 8, { wall, roof, w: 12 + r() * 5, h: 7 + r() * 3, turn: -side * (0.2 + r() * 0.5) })) }
  backdrop(root, r, TH, 66, snowy)
  clouds(root, r, 9)
  return root
}

// ---------------------------------------------------------------- plaza: the town square
// A paved square x -26..26, z -26..26 (y 0). The centrepiece is at (0, -8) and keeps a 6-stud circle; the town hall
// stands at z -40. What the centrepiece is, how the hall looks, the paving, the stalls and the parked vehicles all
// come from the seed.
function plaza(TH, seed) {
  const root = new T.Group(), r = rng(seed)
  const grass = new T.Mesh(new T.PlaneGeometry(900, 900), mat(TH.grass, 0.95)); grass.rotation.x = -Math.PI / 2; grass.position.y = -0.3; grass.receiveShadow = true; grass.userData.tex = 'grass'; root.add(grass)
  const floor = box(root, 70, 0.4, 70, TH.pave, 0, -0.2, -4, pick(r, ['cobble', 'tiles', 'brick', 'concrete'])); floor.castShadow = false
  const stone = pick(r, ['#cfcabd', '#e8e2d2', '#a9adb5'])
  // the centrepiece
  const f = new T.Group(); f.position.set(0, 0, -8); root.add(f)
  const centre = pick(r, ['fountain', 'statue', 'tree', 'clock', 'bandstand'])
  if (centre === 'fountain') {
    const ring = new T.Mesh(new T.CylinderGeometry(4.4, 4.6, 1, 32), mat(stone)); ring.position.y = 0.5; ring.castShadow = true; f.add(ring)
    const water = new T.Mesh(new T.CylinderGeometry(3.9, 3.9, 0.1, 32), new T.MeshStandardMaterial({ color: '#4aa8e8', roughness: 0.15 })); water.position.y = 1.0; water.userData.tex = 'none'; f.add(water)
    const col = new T.Mesh(new T.CylinderGeometry(0.5, 0.7, 3.4, 16), mat(stone)); col.position.y = 2.2; col.castShadow = true; f.add(col); const bowl = new T.Mesh(new T.CylinderGeometry(1.7, 0.5, 0.6, 24), mat(stone)); bowl.position.y = 4.1; bowl.castShadow = true; f.add(bowl)
    const jet = new T.Mesh(new T.SphereGeometry(0.8, 16, 12), new T.MeshStandardMaterial({ color: '#9ad4ff', roughness: 0.2 })); jet.position.y = 4.9; jet.scale.y = 1.3; jet.userData.tex = 'none'; f.add(jet)
  } else if (centre === 'statue') {
    box(f, 4, 3, 4, stone, 0, 1.5, 0, 'stone'); box(f, 4.6, 0.5, 4.6, stone, 0, 3.25, 0); const br = pick(r, ['#8a7a3a', '#5f8f7a', '#8d93a3'])
    box(f, 0.9, 2, 0.9, br, -0.5, 4.5, 0); box(f, 0.9, 2, 0.9, br, 0.5, 4.5, 0); box(f, 2, 2, 1, br, 0, 6.5, 0); box(f, 0.9, 2, 0.9, br, -1.5, 6.4, 0); const arm = box(f, 0.9, 2, 0.9, br, 1.5, 7.4, 0); arm.rotation.z = -2.4; const hd = new T.Mesh(new T.CylinderGeometry(0.62, 0.62, 1.2, 20), mat(br)); hd.position.y = 8.1; hd.castShadow = true; f.add(hd)
  } else if (centre === 'tree') {
    const ring = new T.Mesh(new T.CylinderGeometry(4.2, 4.4, 1.1, 8), mat(stone)); ring.position.y = 0.55; ring.castShadow = true; ring.userData.tex = 'stone'; f.add(ring); const soil = new T.Mesh(new T.CylinderGeometry(3.7, 3.7, 0.1, 8), mat('#6b4a34')); soil.position.y = 1.12; f.add(soil)
    const t = tree(0, 0, 2.1, TH.leaf); t.position.y = 1; f.add(t)
  } else if (centre === 'clock') {
    box(f, 3, 1, 3, stone, 0, 0.5, 0, 'stone'); box(f, 1.6, 11, 1.6, '#22242c', 0, 6.5, 0); box(f, 3.2, 3.2, 3.2, '#22242c', 0, 13.2, 0)
    for (const [dx, dz, ry] of [[0, 1.62, 0], [1.62, 0, Math.PI / 2], [0, -1.62, Math.PI], [-1.62, 0, -Math.PI / 2]]) { const fc = new T.Mesh(new T.CircleGeometry(1.3, 30), new T.MeshBasicMaterial({ color: '#fbf8ee' })); fc.position.set(dx, 13.2, dz); fc.rotation.y = ry; f.add(fc) }
    const cp = new T.Mesh(new T.ConeGeometry(2.6, 2.4, 4), mat('#7b3b34')); cp.rotation.y = Math.PI / 4; cp.position.y = 16; f.add(cp)
  } else {
    const base = new T.Mesh(new T.CylinderGeometry(5, 5, 1, 8), mat('#a07c56')); base.position.y = 0.5; base.castShadow = true; base.userData.tex = 'planks'; f.add(base); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; box(f, 0.3, 5, 0.3, '#f4f1e8', Math.sin(a) * 4.5, 3.5, Math.cos(a) * 4.5) }
    const rf = new T.Mesh(new T.ConeGeometry(6, 3, 8), mat(pick(r, ['#7b3b34', '#3f5a7a', '#4f6a52']))); rf.position.y = 7.5; rf.castShadow = true; rf.userData.tex = 'shingle'; f.add(rf)
  }
  // the town hall: its width, columns, tower and roof come from the seed
  const hall = new T.Group(); hall.position.set(0, 0, -40); root.add(hall); const hw = pick(r, TH.walls), W2 = 28 + Math.floor(r() * 4) * 4, H2 = 13 + Math.floor(r() * 3) * 2, ncol = 4 + Math.floor(r() * 3), tower = pick(r, ['centre', 'centre', 'left', 'right', 'none', 'dome'])
  box(hall, W2, H2, 12, hw, 0, H2 / 2, 0, pick(r, ['stone', 'brick', 'concrete'])); box(hall, W2 + 2, 1, 13, '#f4f1e8', 0, H2 + 0.5, 0); box(hall, W2 - 8, 0.5, 4, '#d9d3ca', 0, 0.25, 7.5); box(hall, W2 - 12, 0.5, 2.6, '#d9d3ca', 0, 0.75, 7)
  for (let i = 0; i < ncol; i++) { const x = (i / (ncol - 1) - 0.5) * (W2 - 12); const c = new T.Mesh(new T.CylinderGeometry(0.6, 0.6, H2 - 5, 14), mat('#f4f1e8')); c.position.set(x, (H2 - 5) / 2 + 1, 6.6); c.castShadow = true; hall.add(c) }
  box(hall, 4, 6.4, 0.3, '#6b4a34', 0, 4.2, 6.1)
  const tx = tower === 'left' ? -W2 / 2 + 5 : tower === 'right' ? W2 / 2 - 5 : 0
  if (tower === 'dome') { const dm = new T.Mesh(new T.SphereGeometry(6, 28, 14, 0, 6.283, 0, 1.571), mat(pick(r, ['#5f8f7a', '#7b3b34', '#3f5a7a']))); dm.position.y = H2 + 1; dm.castShadow = true; hall.add(dm) }
  else if (tower !== 'none') { const th2 = 9 + Math.floor(r() * 3) * 3; box(hall, 8, th2, 8, hw, tx, H2 + th2 / 2, 0, 'stone'); const cap = new T.Mesh(new T.ConeGeometry(6.6, 6, 4), mat(pick(r, ['#7b3b34', '#3f5a7a', '#4f6a52']))); cap.rotation.y = Math.PI / 4; cap.position.set(tx, H2 + th2 + 3, 0); cap.castShadow = true; cap.userData.tex = 'shingle'; hall.add(cap)
    const face = new T.Mesh(new T.CircleGeometry(2.6, 36), new T.MeshBasicMaterial({ color: '#fbf8ee' })); face.position.set(tx, H2 + th2 / 2 + 1, 4.06); hall.add(face); box(hall, 0.25, 2, 0.1, '#222', tx, H2 + th2 / 2 + 1.9, 4.14); box(hall, 1.5, 0.25, 0.1, '#222', tx + 0.7, H2 + th2 / 2 + 1, 4.14) }
  const th = words(pick(r, ['TOWN HALL', 'TOWN HALL', 'CITY HALL', 'LIBRARY', 'MUSEUM', 'COURT HOUSE']), 12, 1.6, '#f4f1e8', '#22242c', 150); th.position.set(0, H2 - 1.6, 6.06); hall.add(th)
  // shop fronts around the edge
  const shops = ['BAKERY', 'TOYS', 'BOOKS', 'CAFE', 'PETS', 'FLOWERS', 'HATS', 'PIZZA', 'MUSIC', 'BIKES', 'CANDY', 'BANK', 'POST'].sort(() => r() - 0.5)
  let si = 0
  for (const sx of [-1, 1]) { let z = 24; while (z > -30) { const w = 11 + Math.floor(r() * 4), h = 15 + Math.floor(r() * 4) * 3.5, g = new T.Group(); box(g, 10, h, w, pick(r, TH.walls), 0, h / 2, 0, r() < 0.5 ? 'brick' : 'siding'); box(g, 10.6, 0.5, w + 0.3, '#e8e2d2', 0, h + 0.25, 0); box(g, 0.3, 3.4, w - 2, '#9cc7e6', -sx * 5.05, 2.6, 0); const sg = words(shops[si++ % shops.length], w - 2, 1.4, '#1f232b', '#ffffff'); sg.position.set(-sx * 5.22, 5.6, 0); sg.rotation.y = (-sx * Math.PI) / 2; g.add(sg); for (let y = 8.5; y < h - 2; y += 4) for (let k = -w / 2 + 2.2; k < w / 2 - 1.5; k += 3.4) box(g, 0.2, 2.6, 2, TH.lit ? new T.MeshBasicMaterial({ color: '#ffd98a' }) : '#3d5f85', -sx * 5.02, y, k); g.position.set(sx * 31, 0, z - w / 2); root.add(g); z -= w + 0.5 } }
  // market stalls: how many and where is seeded
  const aw = ['#d8433b', '#2f7de8', '#2e9c6a', '#e39a2b', '#7d5bd6'].sort(() => r() - 0.5)
  const spots = [[-15, 4], [15, 2], [-15, -16], [15, -18], [-15, 14], [15, 12]].sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * 5))
  spots.forEach(([x, z], i) => { const st = new T.Group(); box(st, 6, 2.2, 3, '#a07c56', 0, 1.1, 0, 'planks'); for (const cx of [-2.8, 2.8]) box(st, 0.2, 5.6, 0.2, '#6b4a34', cx, 2.8, 1.3); for (let k = 0; k < 6; k++) box(st, 1.05, 0.2, 3.8, k % 2 ? '#ffffff' : aw[i % aw.length], -2.62 + k * 1.05, 5.6, 0.4); const goods = pick(r, [['#e8392c', '#f2b233', '#7fd68a', '#ff8a3d'], ['#f6b7d6', '#ffffff', '#ffd21f'], ['#8a5a2c', '#e0c070']]); for (let k = 0; k < 5; k++) { const fr = new T.Mesh(new T.SphereGeometry(0.42, 10, 8), mat(pick(r, goods))); fr.position.set(-2 + k, 2.5, 0.4); st.add(fr) } st.position.set(x, 0, z); st.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; root.add(st) })
  const nb = Math.floor(r() * 4); for (let i = 0; i < nb; i++) { const b = new T.Group(); box(b, 5, 0.3, 1.4, '#a07c56', 0, 1.5, 0); box(b, 5, 1.4, 0.3, '#a07c56', 0, 2.4, -0.6); for (const cx of [-2.2, 2.2]) box(b, 0.3, 1.5, 1.2, '#3a3a40', cx, 0.75, 0); b.position.set([-8, 8, -9, 9][i], 0, [12, 12, -20, -20][i]); b.rotation.y = i < 2 ? Math.PI : 0; root.add(b) }
  const corner = pick(r, ['trees', 'pines', 'flags', 'planters'])
  for (const [x, z] of [[-22, 20], [22, 20], [-22, -26], [22, -26]]) { const l = new T.Group(); box(l, 0.3, 8, 0.3, '#2b2f38', 0, 4, 0); const h = new T.Mesh(new T.SphereGeometry(0.7, 14, 10), new T.MeshStandardMaterial({ color: '#fff4c8', emissive: '#ffd890', emissiveIntensity: TH.lit ? 2.4 : 0.2 })); h.position.y = 8.4; l.add(h); l.position.set(x, 0, z); root.add(l)
    const cx = x * 1.18, cz = z + (z > 0 ? 6 : -4)
    if (corner === 'trees') root.add(tree(cx, cz, 0.8, TH.leaf)); else if (corner === 'pines') root.add(pine(cx, cz, 1.1, TH === CITY_THEMES.snow))
    else if (corner === 'flags') { const g = new T.Group(); box(g, 0.2, 11, 0.2, '#cfd4dc', 0, 5.5, 0); box(g, 3, 1.8, 0.08, pick(r, CAR_COLORS), 1.6, 10, 0); g.position.set(cx, 0, cz); root.add(g) }
    else { const g = new T.Group(); box(g, 3, 1.2, 3, '#8a6f55', 0, 0.6, 0, 'planks'); for (let k = 0; k < 6; k++) { const fl = new T.Mesh(new T.SphereGeometry(0.5, 10, 8), mat(pick(r, ['#ff5fb0', '#ffd21f', '#ffffff', '#e2574c']))); fl.position.set((k % 3) - 1, 1.5, Math.floor(k / 3) - 0.5); g.add(fl) } g.position.set(cx, 0, cz); root.add(g) } }
  // bunting across the square, and small things on the ground
  for (const z of [16, 2, -22]) { const cols = ['#d8433b', '#f2c230', '#2f7de8', '#2e9c6a', '#ff5fb0']; const ln = box(root, 44, 0.06, 0.06, '#22242c', 0, 11.2, z); ln.castShadow = false; for (let i = 0; i < 20; i++) { const fl = new T.Mesh(new T.ConeGeometry(0.5, 0.9, 3), mat(cols[i % 5])); fl.rotation.x = Math.PI; fl.position.set(-21 + i * 2.2, 10.7 - Math.sin((i / 19) * Math.PI) * 0.9, z); fl.userData.tex = 'none'; root.add(fl) } }
  for (let i = 0; i < 14; i++) { const x = (r() < 0.5 ? -1 : 1) * (8 + r() * 14), z = 20 - r() * 44, kind = i % 4
    if (kind === 0) { box(root, 1.4, 1.4, 1.4, '#a07c56', x, 0.7, z, 'planks'); if (r() < 0.5) box(root, 1.1, 1.1, 1.1, '#8a6a4a', x + 0.2, 1.95, z, 'planks') }
    else if (kind === 1) { const b = new T.Mesh(new T.CylinderGeometry(0.7, 0.6, 1.6, 12), mat('#8a5a2c')); b.position.set(x, 0.8, z); b.castShadow = true; b.userData.tex = 'planks'; root.add(b) }
    else if (kind === 2) { box(root, 1.6, 0.9, 1.6, '#8a6f55', x, 0.45, z, 'planks'); const fl = new T.Mesh(new T.SphereGeometry(0.9, 12, 10), mat(pick(r, ['#ff5fb0', '#ffd21f', '#e2574c', TH.leaf]))); fl.position.set(x, 1.4, z); fl.castShadow = true; root.add(fl) }
    else for (let k = 0; k < 3; k++) { const pg = box(root, 0.3, 0.3, 0.5, '#8d93a3', x + k * 0.8, 0.15, z + (k % 2) * 0.6); pg.castShadow = false } }
  backdrop(root, r, TH, 60, TH === CITY_THEMES.snow)
  traffic(root, r, [[-25, 26, 0], [-25, 12, 0], [25, 20, Math.PI], [25, 4, Math.PI], [-25, -6, 0]], 1 + Math.floor(r() * 3), ['sedan', 'hatch', 'van', 'taxi', 'icecream', 'pickup'])
  clouds(root, r)
  return root
}

/**
 * An outdoor world. kind: 'city' (shop street), 'suburb' (family homes and lawns), 'meadow' (open green land),
 * 'plaza' (the town square). theme: sunny, pastel, autumn, snow, night. Any seed number gives a different one.
 */
/** w.clear(x, z, radius): remove the horizon's hills, trees and far houses from a spot, before you build a set there. */
/** w.clearTrees(x0, x1, z0, z1): hide every tree standing inside that box (world x/z), e.g. between the camera and a house. Returns how many. */
export const treeClearer = (root) => (x0, x1, z0, z1) => { let n = 0; const v = new T.Vector3(); root.updateMatrixWorld(true); root.traverse((o) => { if (!o.userData.photoTree && !o.userData.tree) return; o.getWorldPosition(v); if (v.x > Math.min(x0, x1) && v.x < Math.max(x0, x1) && v.z > Math.min(z0, z1) && v.z < Math.max(z0, z1)) { o.visible = false; n++ } }); return n }
export const clearer = (root) => (x, z, rad = 40) => { const gone = []; root.traverse((o) => { if (!o.userData.backdrop) return; const b = new T.Box3().setFromObject(o), c = b.getCenter(new T.Vector3()), half = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2; if (Math.hypot(c.x - x, c.z - z) < rad + half) gone.push(o) }); for (const o of gone) o.parent?.remove(o); return gone.length }
/**
 * houses / cars (optional): ids of Polyfork models loaded with loadModels() (node pf.mjs get <id>). The suburb's homes
 * and every parked car are then picked from them (seeded), so the street is built from the story's own models.
 */
export function world({ kind = 'suburb', theme = 'sunny', seed = 3, houses = [], cars = [] } = {}) {
  OPTS = { houses, cars }
  if (kind === 'city') { const TH = CITY_THEMES[theme] ?? CITY_THEMES.sunny, c = city({ theme, seed, bare: true }), r = rng(seed + 5); traffic(c.root, r, [[5.3, -28, 0], [5.3, -48, 0], [15.7, -30, Math.PI], [15.7, -62, Math.PI], [15.7, -96, Math.PI], [5.3, -112, 0], [15.7, -128, Math.PI], [5.3, -76, 0]] /* nothing parked near z 0, where stories stand; x 8..13 stays free for cars that drive */, 3 + Math.floor(r() * 4), ['bus', 'taxi', 'van', 'truck', 'police', 'icecream', 'pickup', 'sedan', 'hatch']); backdrop(c.root, r, TH, 70, theme === 'snow'); clouds(c.root, r); texturize(c.root); c.root.userData.world = true; (globalThis.FK_PLACES ??= []).push({ build: `world:${kind}`, theme, seed, models: [...houses, ...cars] }); return { root: c.root, kind, houses, cars, style: c.style, clear: clearer(c.root), clearTrees: treeClearer(c.root), ...daylight(c.root, TH) } }
  const TH = CITY_THEMES[theme] ?? CITY_THEMES.sunny, root = { suburb, meadow, plaza }[kind]?.(TH, seed)
  if (!root) throw new Error(`world: unknown kind "${kind}". Use city, suburb, meadow or plaza.`)
  texturize(root)
  root.userData.world = true // the frame check measures the world once for people standing inside it
  ;(globalThis.FK_PLACES ??= []).push({ build: `world:${kind}`, theme, seed, models: [...houses, ...cars] })
  return { root, kind, houses, cars, clear: clearer(root), clearTrees: treeClearer(root), ...daylight(root, TH) }
}
export const WORLD_KINDS = ['city', 'suburb', 'meadow', 'plaza']

// ---------------------------------------------------------------- rooms
// A room is 26 wide (x -13..13), 20 deep (z -10..10) and 12 tall, open toward +z (the camera side). People stand at
// y 0 between z -6 and 8. It has its own lamps, so it looks the same under any outdoor theme.
const ROOMS = {
  living: { wall: '#f2d79a', floor: '#b07a48', light: '#ffe2b0' },
  classroom: { wall: '#dfe7d6', floor: '#c9b89a', light: '#ffffff' },
  diner: { wall: '#c8392f', floor: '#f4f1e8', light: '#fff0d8' },
  library: { wall: '#3a2d5c', floor: '#4a3560', light: '#b9a8ff' },
  bedroom: { wall: '#bcd7f2', floor: '#c9a878', light: '#ffe9c8' },
}
export const ROOM_KINDS = Object.keys(ROOMS)
function shelf(parent, x, z, w, h, r, ry = 0) { const t = tex(256, 512, (g) => { g.fillStyle = '#5a3d28'; g.fillRect(0, 0, 256, 512); const cols = ['#d8433b', '#2f7de8', '#2e9c6a', '#f2c230', '#8d5bd6', '#f4f1e8', '#e39a2b', '#19b6a6']; for (let row = 0; row < 5; row++) { let px = 10; while (px < 240) { const bw = 12 + r() * 16, bh = 60 + r() * 26; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(px, row * 100 + 96 - bh, bw, bh); px += bw + 2 } g.fillStyle = '#3d2a1c'; g.fillRect(0, row * 100 + 96, 256, 8) } }); const m = new T.Mesh(new T.BoxGeometry(w, h, 1.2), [mat('#5a3d28'), mat('#5a3d28'), mat('#5a3d28'), mat('#5a3d28'), new T.MeshStandardMaterial({ map: t, roughness: 0.8 }), mat('#5a3d28')]); m.position.set(x, h / 2, z); m.rotation.y = ry; m.castShadow = true; parent.add(m) }
function windowOn(parent, x, y, z, w, h, glass = '#bfe3ff') { box(parent, w + 0.5, h + 0.5, 0.2, '#f4f1e8', x, y, z); const g = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: glass })); g.position.set(x, y, z + 0.12); parent.add(g); box(parent, 0.14, h, 0.24, '#f4f1e8', x, y, z + 0.06); box(parent, w, 0.14, 0.24, '#f4f1e8', x, y, z + 0.06) }
/**
 * A room. kind: living, classroom, diner, library, bedroom. at: where its floor centre goes (put rooms far from the
 * outdoor world, for example [300, 0, 0], and 60 studs apart). opts: wall, floor (colours), night: true (dark windows).
 */
export function indoor({ kind = 'living', at = [300, 0, 0], seed = 1, wall, floor, night = false } = {}) {
  const R = ROOMS[kind]; if (!R) throw new Error(`indoor: unknown kind "${kind}". Use ${ROOM_KINDS.join(', ')}.`)
  const g = new T.Group(), r = rng(seed), W = wall ?? R.wall, F = floor ?? R.floor, glass = night ? '#1a2248' : '#bfe3ff'; g.position.set(...at)
  const fl = kind === 'diner' ? new T.MeshStandardMaterial({ map: (() => { const t = tex(256, 256, (c) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = (x + y) % 2 ? '#22242c' : '#f4f1e8'; c.fillRect(x * 32, y * 32, 32, 32) } }); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(2, 2); return t })(), roughness: 0.5 }) : mat(F, 0.8)
  const fm = new T.Mesh(new T.BoxGeometry(26, 0.4, 20), fl); fm.userData.tex = kind === 'classroom' ? 'tiles' : 'planks'; fm.position.y = -0.2; fm.receiveShadow = true; g.add(fm)
  const back = box(g, 26, 12, 0.4, W, 0, 6, -10.2); const wl = box(g, 0.4, 12, 20, W, -13.2, 6, 0), wr = box(g, 0.4, 12, 20, W, 13.2, 6, 0), top = box(g, 26.8, 0.4, 20.4, '#f4f1e8', 0, 12.2, 0)
  for (const m of [back, wl, wr, top]) m.castShadow = false
  top.userData.tex = 'none'
  box(g, 26, 0.6, 0.2, '#f4f1e8', 0, 0.3, -9.95)
  for (const x of [-6, 6]) { const l = new T.PointLight(R.light, kind === 'library' ? 10 : 22, 46, 1.4); l.position.set(x, 10, 2); g.add(l) }
  if (kind === 'living') {
    box(g, 9, 1.6, 3.4, '#3d6fd6', -5, 1.2, -7.4, 'fabric'); box(g, 9, 2.6, 1, '#3d6fd6', -5, 2.9, -8.8, 'fabric'); for (const x of [-9.6, -0.4]) box(g, 1, 2.6, 3.4, '#345fb8', x, 1.7, -7.4); for (const x of [-7.2, -2.8]) box(g, 2.2, 1.6, 0.8, '#f2c230', x, 2.7, -8.1)
    box(g, 12, 0.1, 7, '#d8433b', -3, 0.05, -1, 'fabric'); box(g, 5, 1.2, 2.6, '#8a5a2c', -5, 0.6, -2.4)
    box(g, 7, 2, 2, '#5d381a', 8, 1, -8.6); box(g, 6.4, 3.6, 0.3, '#16161c', 8, 4.2, -8.6); box(g, 5.8, 3, 0.1, '#2f4a6a', 8, 4.2, -8.42)
    windowOn(g, -5, 7.6, -9.9, 5, 3.4, glass); for (const x of [-8.2, -1.8]) box(g, 1.2, 4.6, 0.3, '#e88aa8', x, 7.4, -9.7)
    const fr = words('HOME\nSWEET\nHOME', 3, 3, '#fbf8ee', '#b5553a'); fr.position.set(3.2, 7.8, -9.95); g.add(fr); box(g, 0.3, 6, 0.3, '#3a3a40', 12, 3, -6); const sh = new T.Mesh(new T.ConeGeometry(1.2, 1.6, 16, 1, true), new T.MeshStandardMaterial({ color: '#fff0c8', emissive: '#ffd890', emissiveIntensity: 1.2, side: T.DoubleSide })); sh.position.set(12, 6.4, -6); g.add(sh)
    box(g, 1.4, 1.4, 1.4, '#b5553a', -11.6, 0.7, 4); const pl = new T.Mesh(new T.SphereGeometry(1.5, 14, 10), mat('#2e9c6a')); pl.position.set(-11.6, 2.8, 4); pl.scale.y = 1.3; g.add(pl)
  } else if (kind === 'classroom') {
    box(g, 13, 5.4, 0.2, '#2f5d46', 0, 7.2, -9.9); box(g, 13.6, 0.3, 0.5, '#8a5a2c', 0, 4.4, -9.8)
    for (const [x, z] of [[-6, -2], [0, -2], [6, -2], [-6, 4], [0, 4], [6, 4]]) { box(g, 4, 0.25, 2.2, '#c9a26a', x, 2.6, z); for (const sx of [-1.7, 1.7]) box(g, 0.2, 2.5, 1.9, '#6b6f7a', x + sx, 1.25, z); box(g, 1.8, 0.2, 1.6, '#2f7de8', x, 1.5, z + 2.1); box(g, 1.8, 1.6, 0.2, '#2f7de8', x, 2.3, z + 2.9) }
    box(g, 6, 0.3, 2.6, '#8a5a2c', -8.5, 2.9, -7); box(g, 0.3, 2.8, 2.4, '#6b4320', -11.3, 1.4, -7); box(g, 0.3, 2.8, 2.4, '#6b4320', -5.7, 1.4, -7)
    for (const z of [-5, 3]) { const wn = new T.Group(); windowOn(wn, 0, 7.4, 0, 6, 4.4, glass); wn.rotation.y = -Math.PI / 2; wn.position.set(12.95, 0, z); g.add(wn) }
    const ck = new T.Mesh(new T.CircleGeometry(1, 30), new T.MeshBasicMaterial({ color: '#fbf8ee' })); ck.position.set(-9.6, 10.2, -9.95); g.add(ck); box(g, 0.1, 0.8, 0.06, '#222', -9.6, 10.5, -9.9)
    const gl = new T.Mesh(new T.SphereGeometry(0.9, 16, 12), mat('#4aa8e8')); gl.position.set(-8.5, 4.0, -7); g.add(gl)
  } else if (kind === 'diner') {
    box(g, 26, 5, 0.2, '#f4ead0', 0, 9.4, -9.95)
    box(g, 16, 3.4, 2.4, '#f4f1e8', -3, 1.7, -7.6); box(g, 16.4, 0.3, 2.8, '#22242c', -3, 3.5, -7.6); for (let x = -9.5; x <= 3.5; x += 2.6) { const st = new T.Mesh(new T.CylinderGeometry(0.75, 0.75, 0.4, 18), mat('#c8392f', 0.5)); st.position.set(x, 2.3, -5.2); st.castShadow = true; g.add(st); box(g, 0.25, 2.2, 0.25, '#cfd4dc', x, 1.1, -5.2) }
    for (const z of [-2, 5]) { box(g, 3.6, 0.3, 4, '#f4f1e8', 10, 2.7, z); box(g, 0.4, 2.6, 0.4, '#cfd4dc', 10, 1.3, z); for (const dz of [-2.9, 2.9]) { box(g, 3.8, 1.5, 1.4, '#c8392f', 10, 0.9, z + dz); box(g, 3.8, 2.4, 0.4, '#a82c24', 10, 2.8, z + dz + Math.sign(dz) * 0.5) } }
    const ne = words('OPEN 24 H', 8, 1.8, '#22242c', '#ff5fb0'); ne.position.set(-3, 9.4, -9.8); g.add(ne); const mn = words('BURGERS  3\nFRIES  2\nSHAKES  2', 5, 3, '#22242c', '#f4f1e8'); mn.position.set(7.5, 8.6, -9.8); g.add(mn)
    for (const x of [-8, -3, 2]) { box(g, 0.1, 2.4, 0.1, '#22242c', x, 10.8, -6.5); const sh = new T.Mesh(new T.ConeGeometry(0.9, 0.9, 16, 1, true), new T.MeshStandardMaterial({ color: '#f2c230', emissive: '#ffd890', emissiveIntensity: 1, side: T.DoubleSide })); sh.position.set(x, 9.3, -6.5); g.add(sh) }
  } else if (kind === 'library') {
    for (const x of [-9.5, -3.2, 3.2, 9.5]) shelf(g, x, -9.2, 5.6, 10.5, r)
    shelf(g, -12.3, 1, 9, 10.5, r, Math.PI / 2); shelf(g, 12.3, 1, 9, 10.5, r, -Math.PI / 2)
    box(g, 9, 0.4, 4, '#6b4320', 0, 2.8, 1); for (const [x, z] of [[-4, -0.6], [4, -0.6], [-4, 2.6], [4, 2.6]]) box(g, 0.4, 2.6, 0.4, '#4a2d16', x, 1.3, z)
    box(g, 12, 0.1, 8, '#7a2d4a', 0, 0.05, 1); for (let i = 0; i < 6; i++) box(g, 1.5, 0.3, 1.1, pick(r, ['#d8433b', '#2f7de8', '#2e9c6a', '#f2c230']), -3 + r() * 6, 3.15 + (i % 3) * 0.3, 0.4 + r() * 1.4).rotation.y = r()
    box(g, 0.2, 1.6, 0.2, '#f2c230', 3.4, 3.8, 1); const sh = new T.Mesh(new T.SphereGeometry(0.6, 14, 10), new T.MeshStandardMaterial({ color: '#b8f5c0', emissive: '#6fe38a', emissiveIntensity: 2 })); sh.position.set(3.4, 4.9, 1); g.add(sh)
    const q = words('SHHH', 4, 1.6, '#f4f1e8', '#3a2d5c'); q.position.set(0, 11, -9.95); g.add(q)
  } else {
    box(g, 6, 1.4, 9, '#f4f1e8', -8.4, 1.4, -4.6); box(g, 6.2, 0.7, 6.4, '#2f7de8', -8.4, 2.3, -3.2, 'fabric'); box(g, 4.4, 0.7, 1.8, '#ffffff', -8.4, 2.3, -8); box(g, 6.4, 3.6, 0.5, '#8a5a2c', -8.4, 1.8, -9.5); for (const [x, z] of [[-11, -8.8], [-5.8, -8.8], [-11, -0.4], [-5.8, -0.4]]) box(g, 0.5, 0.8, 0.5, '#6b4320', x, 0.4, z)
    box(g, 2.2, 2.4, 2.2, '#8a5a2c', -3.6, 1.2, -8.6); box(g, 0.2, 1.4, 0.2, '#3a3a40', -3.6, 3.1, -8.6); const sh = new T.Mesh(new T.ConeGeometry(0.8, 1, 16, 1, true), new T.MeshStandardMaterial({ color: '#fff0c8', emissive: '#ffd890', emissiveIntensity: 1.4, side: T.DoubleSide })); sh.position.set(-3.6, 4.2, -8.6); g.add(sh)
    windowOn(g, 2.5, 7.4, -9.9, 5, 4, glass); for (const x of [-0.6, 5.6]) box(g, 1.1, 5, 0.3, '#f2c230', x, 7.2, -9.7)
    box(g, 5.4, 9, 2.4, '#a07c56', 9.8, 4.5, -8.6); box(g, 0.1, 8.4, 0.1, '#6b4320', 9.8, 4.5, -7.36); for (const x of [9.3, 10.3]) box(g, 0.2, 0.7, 0.2, '#f2c230', x, 4.5, -7.3)
    box(g, 10, 0.1, 6, '#ff8fc8', 1, 0.05, 1); const po = words('STAY\nWEIRD', 2.8, 3.4, '#22242c', '#ffd21f'); po.position.set(-10, 8.4, -9.95); g.add(po)
    box(g, 4, 2.6, 2, '#f4f1e8', 9.4, 1.3, 3); box(g, 4.4, 0.3, 2.4, '#8a5a2c', 9.4, 2.75, 3)
  }
  texturize(g)
  g.userData.world = true // the frame check measures it for people standing inside the furniture
  ;(globalThis.FK_PLACES ??= []).push({ build: `room:${kind}`, theme: null, seed, models: [] })
  return g
}

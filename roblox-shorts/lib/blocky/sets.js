// Sets and light (the kit's Street, Room and MOODS). All sets are built once and reused across shots.
// street(): a road along z with sidewalks, houses with lit windows, trees, a hydrant and a mailbox. Sidewalk top = 0.25.
// room():   a 16 x 14 x 10 room with a window in the far wall and a yard outside; bedroom or living room furniture.
// lights() + mood(): one light rig for the whole video; mood() switches it per shot.
import { T, D, rnd, srgb } from './core.js'
import { M, box, at } from './materials.js'

// ---------------------------------------------------------------- light
const MOODS = { //  sky horizon, zenith | hemisphere sky, ground, k | sun colour, k, elevation, azimuth | fill k | exposure
  day: { hz: [170, 214, 250], zen: [44, 118, 232], hemi: [[200, 215, 245], [140, 130, 110], 2.2], sun: [[255, 240, 214], 3.2, 46, 216], fill: 0.9, exp: 1.65 },
  dusk: { hz: [255, 150, 90], zen: [60, 52, 140], hemi: [[190, 150, 200], [100, 80, 90], 1.5], sun: [[255, 150, 90], 2.2, 15, 238], fill: 0.8, exp: 1.7 },
  night: { hz: [26, 36, 90], zen: [5, 7, 26], hemi: [[110, 124, 190], [40, 44, 60], 1.3], sun: [[160, 178, 245], 1.1, 44, 150], fill: 1.0, exp: 1.35 },
  room: { hz: [170, 214, 250], zen: [44, 118, 232], hemi: [[250, 238, 224], [180, 160, 135], 2.2], sun: [[255, 238, 214], 2.0, 56, 205], fill: 1.3, exp: 1.15 },
  room_dusk: { hz: [255, 150, 90], zen: [60, 52, 140], hemi: [[255, 210, 170], [130, 100, 80], 1.5], sun: [[255, 190, 140], 1.3, 56, 205], fill: 1.0, exp: 1.3 },
  room_night: { hz: [26, 36, 90], zen: [5, 7, 26], hemi: [[128, 136, 190], [50, 50, 70], 1.2], sun: [[170, 182, 240], 0.7, 52, 20], fill: 1.0, exp: 1.4 },
  // the reference look families (pack v3): golden hour / power, gold glory, lava / danger, white heaven light
  golden: { hz: [255, 170, 70], zen: [90, 90, 170], hemi: [[255, 170, 90], [110, 60, 30], 1.4], sun: [[255, 170, 70], 3.0, 12, 232], fill: 0.55, exp: 1.4 },
  glory: { hz: [255, 226, 150], zen: [230, 170, 80], hemi: [[255, 222, 160], [190, 130, 70], 2.6], sun: [[255, 228, 170], 3.0, 40, 220], fill: 1.0, exp: 1.6 },
  danger: { hz: [190, 40, 16], zen: [40, 6, 6], hemi: [[170, 50, 30], [70, 14, 8], 1.4], sun: [[255, 100, 40], 2.6, 18, 200], fill: 0.6, exp: 1.5 },
  heaven: { hz: [246, 248, 252], zen: [200, 222, 248], hemi: [[244, 246, 252], [214, 216, 224], 3.0], sun: [[255, 252, 240], 1.6, 60, 210], fill: 1.0, exp: 1.55 },
}
export const MOOD_NAMES = Object.keys(MOODS)
/** The light rig: hemisphere, a shadow-casting sun (or moon), a fill from the camera side, and a sky per mood. */
export function lights(root) {
  const hemi = new T.HemisphereLight(); root.add(hemi)
  const sun = new T.DirectionalLight(); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 160 }); sun.shadow.bias = -0.0006; sun.shadow.radius = 4
  root.add(sun); root.add(sun.target)
  const fill = new T.DirectionalLight(); root.add(fill); root.add(fill.target)
  const skies = {}
  for (const [n, m] of Object.entries(MOODS)) { const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256)
    gr.addColorStop(0, `rgb(${m.zen})`); gr.addColorStop(1, `rgb(${m.hz})`); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; skies[n] = t }
  return { hemi, sun, fill, skies, name: 'day' }
}
/** Switch the rig to a mood for this frame. Call after the camera is placed: the sun and fill follow the camera. */
export function mood(rig, name, scene, camera, renderer) {
  const m = MOODS[name]; if (!m) throw new Error(`unknown mood "${name}"; moods: ${MOOD_NAMES.join(', ')}`)
  rig.name = name; rig.hemi.color = srgb(m.hemi[0]); rig.hemi.groundColor = srgb(m.hemi[1]); rig.hemi.intensity = m.hemi[2]
  const [sc, sk, el, az] = m.sun, c = camera.position
  rig.sun.color = srgb(sc); rig.sun.intensity = sk; rig.sun.target.position.set(c.x, 0, c.z - 10)
  rig.sun.position.set(c.x + Math.cos(D(az)) * Math.cos(D(el)) * 50, Math.sin(D(el)) * 50, c.z - 10 + Math.sin(D(az)) * Math.cos(D(el)) * 50)
  rig.fill.color = srgb(name.includes('night') ? [200, 205, 235] : name === 'danger' ? [255, 140, 90] : [250, 240, 228]); rig.fill.intensity = m.fill
  rig.fill.position.copy(c).add(new T.Vector3(2, 3, 0)); rig.fill.target.position.set(c.x, 3, c.z - 6)
  scene.background = rig.skies[name]
  if (renderer) renderer.toneMappingExposure = m.exp
}
export const moodExposure = (name) => MOODS[name]?.exp ?? 1

// ---------------------------------------------------------------- street
const HOUSE_COLS = [[[158, 62, 50], [58, 44, 46], 'brick'], [[214, 170, 86], [88, 58, 44], 'siding'], [[70, 118, 176], [44, 50, 72], 'siding'], [[226, 216, 196], [120, 52, 46], 'siding'], [[96, 150, 128], [48, 62, 66], 'siding'], [[124, 106, 168], [52, 46, 78], 'siding'], [[196, 110, 62], [70, 48, 42], 'brick'], [[232, 232, 226], [64, 72, 96], 'siding']]
/** A road along z (x = 0), sidewalks at x = ±8.2 (top 0.25), houses at x = ±19 facing the road. Returns { root, windows, floorY, setWindows(k) }. */
export function street({ length = 9 } = {}) {
  const root = new T.Group(), S = { root, windows: [], floorY: 0.25 }
  const plane = (w, d, m, x, y, z) => { const p = new T.Mesh(new T.PlaneGeometry(w, d), m); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; root.add(p) }
  plane(400, 400, M([52, 110, 46], { rough: 0.95, tex: 'grass', rep: [60, 60] }), 0, 0, 0)
  plane(12, 300, M([52, 54, 62], { rough: 0.8, tex: 'asphalt', rep: [4, 100] }), 0, 0.08, -60)
  for (let z = 40; z > -160; z -= 8) plane(0.4, 3.2, M([236, 236, 226], { rough: 0.7 }), 0, 0.14, z)
  for (const sx of [-1, 1]) at(root, box([4.4, 300, 0.5], M([150, 152, 160], { rough: 0.8, tex: 'tiles', rep: [2, 140] }), 0.05), sx * 8.2, 60, 0)
  const house = (x, z, face, ci) => { const [wall, roofC, tex] = HOUSE_COLS[ci % HOUSE_COLS.length], G = new T.Group(); G.position.set(x, 0, z); G.rotation.y = face; root.add(G)
    const wm = M(wall, { rough: 0.75, tex, rep: [3, 3] }), w = 14, d = 10, h = 8
    at(G, box([w, d, h], wm, 0.06), 0, 0, h / 2)
    const pr = new T.Shape([new T.Vector2(-d / 2 - 0.6, 0), new T.Vector2(d / 2 + 0.6, 0), new T.Vector2(0, 4.2)]), pg = new T.ExtrudeGeometry(pr, { depth: w + 1.4, bevelEnabled: false }); pg.translate(0, 0, -(w + 1.4) / 2)
    const roof = new T.Mesh(pg, M(roofC, { rough: 0.8, tex: 'shingle', rep: [6, 3] })); roof.rotation.y = Math.PI / 2; roof.position.y = h; roof.castShadow = true; G.add(roof)
    at(G, box([2.4, 0.3, 4.5], M([[120, 76, 50], [60, 90, 170], [190, 60, 60], [70, 130, 90]][ci % 4], { rough: 0.5 }), 0.06), 0, -d / 2 - 0.05, 2.3)
    for (const wx of [-4.2, 4.2]) { at(G, box([2.8, 0.25, 2.6], M([236, 236, 230], { rough: 0.6 }), 0.05), wx, -d / 2 - 0.05, 4.4)
      const gm = new T.MeshStandardMaterial({ color: '#9fc4e0', roughness: 0.15 }); at(G, box([2.3, 0.2, 2.1], gm, 0.02), wx, -d / 2 - 0.12, 4.4); S.windows.push({ gm, on: rnd() < 0.7 }) } }
  for (let i = 0; i < length; i++) { house(-19, 20 - i * 20, Math.PI / 2, i); house(19, 12 - i * 20, -Math.PI / 2, i + 3) }
  const trunk = M([96, 62, 40], { rough: 0.85, tex: 'noise', amt: 0.35, rep: [2, 2] }), leaf = M([36, 104, 50], { rough: 0.85, tex: 'noise', amt: 0.3, rep: [2, 2] })
  const tree = (x, z, s) => { const g = new T.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); root.add(g); at(g, box([0.8, 0.8, 5], trunk, 0.1), 0, 0, 2.5)
    for (const [a, b, c, r] of [[0, 0, 6.4, 2.4], [1.2, 0.4, 5.6, 1.7], [-1.1, -0.3, 5.7, 1.8], [0.2, 0.2, 7.6, 1.6]]) { const l = new T.Mesh(new T.IcosahedronGeometry(r, 0), leaf); l.castShadow = l.receiveShadow = true; at(g, l, a, b, c) } }
  for (let i = 0; i < length; i++) { tree(-12.5, 10 - i * 20, 0.9); tree(12.5, 2 - i * 20, 0.9) }
  at(root, box([0.7, 0.7, 1.1], M([200, 50, 46]), 0.2), -10.2, -2, 0.8); at(root, box([0.9, 0.9, 1.5], M([60, 110, 220]), 0.2), -10.2, 14, 1)
  /** Window glow: 0 (day) .. 1 (night, most windows lit). */
  S.setWindows = (k) => S.windows.forEach((w) => { const on = w.on && k > 0; w.gm.color.set(on ? '#ffd890' : k > 0 ? '#1c2238' : '#9fc4e0'); w.gm.emissive.set(on ? '#ffc070' : '#000'); w.gm.emissiveIntensity = on ? 1.4 * k : 0 })
  S.setWindows(0); return S
}

// ---------------------------------------------------------------- room
/**
 * A box room 16 wide (x), 14 deep, 10 high, floor at y = 0, centred on (x0, z0). The far wall (-z) has a window with a yard
 * and the moon outside. kind 'bedroom' (bed under the window, nightstand + lamp, rug, shelves, toys, posters) or 'living'
 * (sofa, rug, TV, floor lamp, plant). Walls can be hidden per shot: room.show({ near: false }).
 * Returns { root, floorY: 0, walls, lamp: { on(k) }, blanket, P(x, z) -> world position }.
 */
export function room({ kind = 'bedroom', x0 = 200, z0 = 0, wall = [150, 200, 240], floor = [196, 140, 86], trim = [236, 236, 238], cover = [44, 62, 128] } = {}) {
  const root = new T.Group(); root.position.set(x0, 0, z0)
  const Wd = 16, Dp = 14, H = 10, mw = M(wall, { rough: 0.9, tex: 'noise', amt: 0.12, rep: [3, 2] }), mt = M(trim, { rough: 0.5 })
  const R = { root, floorY: 0, walls: {}, P: (x, z) => new T.Vector3(x0 + x, 0, z0 + z) }
  at(root, box([Wd, Dp, 0.4], M(floor, { rough: 0.32, tex: 'planks', rep: [3, 3] }), 0), 0, 0, -0.2)
  const wallObj = (key, boxes, trims) => { const g = new T.Group(); root.add(g); for (const [s, l] of boxes) at(g, box(s, mw, 0.001), ...l); for (const [s, l] of trims) at(g, box(s, mt, 0.04), ...l); R.walls[key] = g }
  // kit +Y (far) = three -z: the window wall
  wallObj('far', [[[Wd, 0.5, 4.2], [0, Dp / 2 + 0.25, 2.1]], [[Wd, 0.5, H - 8.4], [0, Dp / 2 + 0.25, (H + 8.4) / 2]], [[Wd / 2 - 3.2, 0.5, 4.2], [-(Wd / 2 + 3.2) / 2, Dp / 2 + 0.25, 6.3]], [[Wd / 2 - 3.2, 0.5, 4.2], [(Wd / 2 + 3.2) / 2, Dp / 2 + 0.25, 6.3]]],
    [[[Wd, 0.2, 0.7], [0, Dp / 2 - 0.05, 0.35]], [[7.2, 0.9, 0.36], [0, Dp / 2 + 0.1, 4.1]], [[7.2, 0.8, 0.36], [0, Dp / 2 + 0.2, 8.5]], [[0.4, 0.8, 4.5], [-3.4, Dp / 2 + 0.2, 6.3]], [[0.4, 0.8, 4.5], [3.4, Dp / 2 + 0.2, 6.3]]])
  wallObj('near', [[[Wd, 0.5, H], [0, -Dp / 2 - 0.25, H / 2]]], [[[Wd, 0.2, 0.7], [0, -Dp / 2 + 0.05, 0.35]]])
  wallObj('right', [[[0.5, Dp + 1, H], [Wd / 2 + 0.25, 0, H / 2]]], [[[0.2, Dp, 0.7], [Wd / 2 - 0.05, 0, 0.35]]])
  wallObj('left', [[[0.5, Dp + 1, H], [-Wd / 2 - 0.25, 0, H / 2]]], [[[0.2, Dp, 0.7], [-Wd / 2 + 0.05, 0, 0.35]]])
  wallObj('ceil', [[[Wd + 1, Dp + 1, 0.4], [0, 0, H + 0.2]]], [])
  for (const g of Object.values(R.walls)) g.traverse((m) => { if (m.isMesh) m.castShadow = false })
  // yard: grass, fence, trees, moon
  at(root, box([300, 200, 0.6], M([66, 150, 56], { rough: 0.95, tex: 'grass', rep: [60, 40] }), 0), 0, Dp / 2 + 100.6, -0.3)
  const wf = M([222, 222, 226], { rough: 0.7, tex: 'noise', rep: [1, 1] }); for (let i = -12; i <= 12; i++) at(root, box([1.0, 0.25, 4.2], wf, 0.1), i * 1.5, Dp / 2 + 24, 2.1)
  const tr = M([96, 62, 40], { rough: 0.85 }), lf = M([44, 128, 56], { rough: 0.85, tex: 'noise', amt: 0.3, rep: [2, 2] }); at(root, box([1.4, 1.4, 9], tr, 0.2), -9, Dp / 2 + 19, 4.5)
  for (const [x, y, z, r] of [[-9, Dp / 2 + 19, 11.5, 5.2], [-6, Dp / 2 + 18, 14, 3.8], [11, Dp / 2 + 21, 9.5, 4.4]]) { const b = new T.Mesh(new T.IcosahedronGeometry(r, 1), lf); b.castShadow = true; at(root, b, x, y, z) }
  const moon = new T.Mesh(new T.SphereGeometry(7, 24, 16), new T.MeshBasicMaterial({ color: srgb([255, 250, 225]) })); at(root, moon, 14, Dp / 2 + 150, 62); R.moon = moon
  const lampLight = new T.PointLight('#ffc882', 0, 26, 1.4); lampLight.castShadow = true; lampLight.shadow.radius = 6; root.add(lampLight)
  const shadeM = new T.MeshStandardMaterial({ color: srgb([255, 236, 190]), emissive: srgb([255, 214, 140]), emissiveIntensity: 0, roughness: 0.8 })
  R.lamp = { light: lampLight, on: (k = 1) => { shadeM.emissiveIntensity = 2.2 * k; lampLight.intensity = 60 * k } }
  const cyl = (rad, h, mat, x, y, z, r2) => { const c = new T.Mesh(new T.CylinderGeometry(r2 ?? rad, rad, h, 20), mat); c.castShadow = true; at(root, c, x, y, z); return c }
  if (kind === 'bedroom') {
    const fr = M([92, 60, 40], { rough: 0.45, tex: 'noise', amt: 0.25, rep: [2, 2] }), sheet = M([226, 226, 232], { rough: 0.9, tex: 'fabric', rep: [3, 3] })
    at(root, box([5.9, 9.0, 0.8], fr, 0.12), 0, 2.3, 0.9); at(root, box([5.9, 0.5, 3.6], fr, 0.14), 0, 6.75, 2.0); at(root, box([5.9, 0.4, 1.6], fr, 0.12), 0, -2.1, 1.3)
    for (const sx of [-1, 1]) for (const sy of [-1.9, 6.6]) at(root, box([0.5, 0.5, 0.6], fr, 0.08), sx * 2.6, sy, 0.3)
    at(root, box([5.4, 8.6, 1.0], sheet, 0.2), 0, 2.3, 1.7); at(root, box([3.8, 1.9, 0.6], sheet, 0.24), 0, 5.5, 2.4)
    R.blanket = at(root, box([5.8, 5.8, 1.3], M(cover, { rough: 0.9, tex: 'fabric', rep: [3, 3] }), 0.26), 0, 0.95, 2.8)
    at(R.blanket, box([5.84, 0.9, 1.34], M([200, 204, 216], { rough: 0.9, tex: 'fabric', rep: [3, 1] }), 0.26), 0, 2.5, 0)
    const wd = M([104, 68, 44], { rough: 0.45, tex: 'noise', amt: 0.25 }); at(root, box([2.2, 2.0, 2.2], wd, 0.1), 4.5, 5.7, 1.1)
    cyl(0.3, 1.0, M([90, 100, 130], { rough: 0.4 }), 4.85, 6.0, 2.7); cyl(0.95, 1.1, shadeM, 4.85, 6.0, 3.7, 0.6); at(root, lampLight, 3.3, 3.9, 5.0)
    at(root, box([7.5, 4.6, 0.12], M([150, 44, 48], { rough: 0.95, tex: 'fabric', rep: [3, 2] }), 0.05), -0.5, -4.2, 0.06); at(root, box([6.3, 3.4, 0.14], M([206, 190, 150], { rough: 0.95, tex: 'fabric', rep: [3, 2] }), 0.05), -0.5, -4.2, 0.07)
    const sw = M([120, 80, 50], { rough: 0.5, tex: 'noise', amt: 0.25 }); at(root, box([0.9, 4.6, 0.25], sw, 0.05), -7.5, -1.0, 5.2); at(root, box([0.9, 4.6, 0.25], sw, 0.05), -7.5, -1.0, 7.0)
    ;[[[240, 80, 70], 0.9], [[80, 160, 240], 0.7], [[250, 205, 80], 1.0], [[110, 205, 130], 0.8]].forEach(([c, s], i) => at(root, box([0.7, s, s], M(c), 0.08), -7.45, -2.6 + i * 1.05, 5.33 + s / 2))
    at(root, box([2.6, 3.4, 1.8], M([52, 84, 130], { rough: 0.5, tex: 'noise' }), 0.08), -6.4, -4.6, 0.9)
    const cu = M([176, 60, 52], { rough: 0.95, tex: 'fabric', rep: [1, 3] }); for (const sx of [-1, 1]) at(root, box([1.3, 0.3, 5.4], cu, 0.14), sx * 4.3, Dp / 2 - 0.35, 6.3)
  } else {
    const sf = M([58, 84, 76], { rough: 0.95, tex: 'fabric', rep: [3, 2] }), sf2 = M([78, 108, 98], { rough: 0.95, tex: 'fabric', rep: [2, 2] })
    at(root, box([8.4, 3.0, 1.5], sf, 0.3), 0, 5.2, 0.95); at(root, box([8.4, 0.9, 3.4], sf, 0.35), 0, 6.3, 1.9); for (const sx of [-1, 1]) at(root, box([0.9, 3.0, 2.4], sf, 0.35), sx * 4.3, 5.2, 1.4)
    for (const sx of [-1, 1]) at(root, box([3.4, 2.4, 0.6], sf2, 0.25), sx * 1.8, 5.0, 1.9)
    at(root, box([10, 6.4, 0.12], M([150, 44, 48], { rough: 0.95, tex: 'fabric', rep: [4, 3] }), 0.05), 0, 0.2, 0.06); at(root, box([8.6, 5.0, 0.14], M([196, 180, 150], { rough: 0.95, tex: 'fabric', rep: [4, 3] }), 0.05), 0, 0.2, 0.07)
    at(root, box([1.6, 5.2, 1.5], M([120, 80, 50], { rough: 0.5, tex: 'noise', amt: 0.25 }), 0.1), -7.0, -1.0, 0.75); at(root, box([0.3, 4.6, 2.8], M([30, 30, 38], { rough: 0.3 }), 0.08), -7.0, -1.0, 3.1)
    R.tv = at(root, box([0.32, 4.2, 2.4], new T.MeshStandardMaterial({ color: srgb([70, 110, 160]), emissive: srgb([90, 150, 255]), emissiveIntensity: 1.2, roughness: 0.2 }), 0.04), -6.98, -1.0, 3.1)
    cyl(0.12, 6.6, M([90, 90, 100], { rough: 0.4 }), 6.4, 4.6, 3.3); cyl(0.8, 0.2, M([90, 90, 100]), 6.4, 4.6, 0.1); cyl(1.2, 1.4, shadeM, 6.4, 4.6, 7.0, 0.8); at(root, lampLight, 5.2, 3.0, 6.4)
    cyl(0.8, 1.3, M([200, 110, 70]), 6.6, -5.4, 0.65, 1.0); const pl = new T.Mesh(new T.IcosahedronGeometry(1.5, 1), M([64, 170, 72], { tex: 'noise', amt: 0.3 })); pl.scale.y = 1.3; at(root, pl, 6.6, -5.4, 2.6)
    const cu = M([70, 96, 120], { rough: 0.95, tex: 'fabric', rep: [1, 3] }); for (const sx of [-1, 1]) at(root, box([1.3, 0.3, 5.4], cu, 0.14), sx * 4.3, Dp / 2 - 0.35, 6.3)
    R.lamp.on(1)
  }
  /** Hide walls that would block the camera: show({ near: false, ceil: false }). */
  R.show = (o = {}) => { for (const [k, g] of Object.entries(R.walls)) g.visible = o[k] ?? (k !== 'near' && k !== 'ceil') }
  R.show(); return R
}

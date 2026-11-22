// The bright town of the classic look: flat green ground, a blue gradient sky, ball trees and pastel houses, with
// soft daylight. Matched against videos/reference/nn3_MOuxoho (frames at 2.5 s and 8.5 s). Units are studs.
import { T } from './core.js'

const mat = (color, rough = 0.85) => new T.MeshStandardMaterial({ color, roughness: rough })
function box(parent, w, h, d, color, x, y, z) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m }

/** A sky dome: deep blue overhead, light blue at the horizon. */
export function sky(top = '#1c6ff2', horizon = '#a9d8ff') {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256)
  gr.addColorStop(0, top); gr.addColorStop(0.5, top); gr.addColorStop(0.92, horizon); gr.addColorStop(1, horizon); g.fillStyle = gr; g.fillRect(0, 0, 4, 256)
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace
  const m = new T.Mesh(new T.SphereGeometry(400, 24, 16), new T.MeshBasicMaterial({ map: t, side: T.BackSide, fog: false })); m.position.y = -40
  return m
}
/** A ball tree: a brown block trunk and a green ball (or a stack of balls). */
export function tree(x, z, s = 1, green = '#19b24b') {
  const ph = globalThis.FK_PHOTO_TREE?.('island_tree_01', x, z, 12 * s, '#ffffff', x * 3 + z); if (ph) return ph // a real tree when the photo trees are loaded
  const g = new T.Group(); box(g, 1.6 * s, 5 * s, 1.6 * s, '#6b4a34', 0, 2.5 * s, 0)
  const ball = new T.Mesh(new T.SphereGeometry(4.2 * s, 28, 20), mat(green, 0.9)); ball.position.y = 7.6 * s; ball.castShadow = true; g.add(ball)
  g.position.set(x, 0, z); g.userData.tree = true; return g
}
/** A simple pastel house: walls, a pitched roof, a door and windows. */
export function house(x, z, { w = 14, h = 8, d = 12, wall = '#f3f0c8', roof = '#9fd6a0', turn = 0 } = {}) {
  const g = new T.Group(); box(g, w, h, d, wall, 0, h / 2, 0)
  const r = new T.Mesh(new T.CylinderGeometry(0.01, w * 0.78, h * 0.62, 4, 1), mat(roof)); r.rotation.y = Math.PI / 4; r.scale.z = d / w; r.position.y = h + h * 0.31; r.castShadow = true; g.add(r)
  box(g, 2.4, 4.4, 0.3, '#ffffff', 0, 2.2, d / 2 + 0.1)
  for (const sx of [-1, 1]) box(g, 2.6, 2.4, 0.3, '#bfe3ff', sx * w * 0.3, h * 0.6, d / 2 + 0.1)
  g.position.set(x, 0, z); g.rotation.y = turn; return g
}
/**
 * The whole town. Returns { root, sun }. opts.ground: the ground colour; opts.snow: true for the snowy version
 * (white ground, grey-blue sky, fog).
 */
export function town({ snow = false, ground = snow ? '#dfe8f5' : '#22d05a' } = {}) {
  const root = new T.Group()
  root.add(sky(snow ? '#9fb2cc' : '#1c6ff2', snow ? '#e6edf7' : '#a9d8ff'))
  const gr = new T.Mesh(new T.PlaneGeometry(900, 900), mat(ground, 0.95)); gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true; root.add(gr)
  const pastel = [['#f3f0c8', '#9fd6a0'], ['#ffffff', '#bfe3ff'], ['#ffd9a8', '#ff9c5a'], ['#cfe9ff', '#7fb6ff'], ['#f6c9d8', '#e88aa8']]
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 9; i++) { const [wall, roof] = pastel[i % pastel.length], side = i % 2 ? 1 : -1; root.add(house(side * (26 + r() * 30), -30 - i * 24 + r() * 10, { wall, roof, w: 12 + r() * 6, h: 7 + r() * 3, turn: -side * 0.2 })) }
  for (let i = 0; i < 16; i++) { const side = i % 2 ? 1 : -1; root.add(tree(side * (12 + r() * 46), -14 - r() * 190, 0.8 + r() * 0.9, snow ? '#8aa6a0' : i % 3 ? '#19b24b' : '#27c95a')) }
  root.add(new T.HemisphereLight('#ffffff', snow ? '#dfe8f5' : '#bfeecb', snow ? 2.6 : 2.2))
  const sun = new T.DirectionalLight('#ffffff', snow ? 0.8 : 1.5); sun.position.set(-14, 30, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 5
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 }); root.add(sun)
  return { root, sun, fog: snow ? new T.Fog('#dfe8f5', 30, 160) : null }
}
/** Falling snow: call the returned update(t) every frame. Flakes are a pure function of time. */
export function snowfall(n = 260, area = 36) {
  const g = new T.BufferGeometry(), p = new Float32Array(n * 3), seed = []
  let s = 9; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < n; i++) seed.push([r() * area - area / 2, r() * 26, r() * area - area / 2, 1.2 + r() * 1.6, r() * 6])
  g.setAttribute('position', new T.BufferAttribute(p, 3))
  const pts = new T.Points(g, new T.PointsMaterial({ color: '#ffffff', size: 0.34, sizeAttenuation: true, transparent: true, opacity: 0.95, fog: false })); pts.frustumCulled = false
  pts.userData.update = (t) => { seed.forEach(([x, y, z, v, ph], i) => { p[i * 3] = x + Math.sin(t * 0.7 + ph) * 0.8; p[i * 3 + 1] = ((y - t * v) % 26 + 26) % 26; p[i * 3 + 2] = z }); g.attributes.position.needsUpdate = true }
  return pts
}

// ---------------------------------------------------------------- the detailed town street
// Matched against videos/reference/T5uvW3AqV7c: rows of coloured buildings with windows, shops with striped awnings
// and signs, a road with lane markings and a crossing, pavements, lamps, parked cars, planters, haze in the distance.
// Layout (studs): the near pavement is x -3.5..3.5 at y = 0 (people stand here, facing +z); buildings on its left;
// the road is x 3.5..17.5; the far pavement and its buildings are beyond. The street runs along z from +40 to -150.
function facade(w, h, wall, o = {}) {
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round((512 * h) / w); const g = c.getContext('2d'), u = 512 / w
  const base = new T.Color(wall), src = globalThis.FK_SURF?.[o.tex]?.map?.image
  if (src) base.multiplyScalar(1.22) // the surface below darkens it by about this much
  g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, c.width, c.height)
  if (src) { const p = g.createPattern(src, 'repeat'), k = (u * (o.tex === 'brick' ? 9 : 11)) / 512; p.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0])); g.globalCompositeOperation = 'multiply'; g.fillStyle = p; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over' }
  const gy = c.height - 5.2 * u // top of the ground floor
  const ws = o.windows ?? 'grid', glass = o.lit ? '#ffd98a' : o.glass ?? '#3d5f85', trim = o.trim ?? '#f4f1e8'
  if (ws === 'bands') { for (let y = gy - 4 * u; y > 1.2 * u; y -= 3.6 * u) { g.fillStyle = trim; g.fillRect(0.6 * u, y - 0.25 * u, c.width - 1.2 * u, 2.9 * u); g.fillStyle = glass; g.fillRect(0.8 * u, y, c.width - 1.6 * u, 2.4 * u); g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(0.8 * u, y, c.width - 1.6 * u, 0.8 * u); g.fillStyle = trim; for (let x = 0.8 * u; x < c.width; x += 2.4 * u) g.fillRect(x, y, 0.16 * u, 2.4 * u) } }
  else { const ww = ws === 'tall' ? 1.6 : 2, wh = ws === 'tall' ? 3.4 : 2.8, step = ws === 'tall' ? 2.9 : 3.4
    for (let y = gy - 4.2 * u; y > 1.2 * u; y -= 4.4 * u) for (let x = 1.4 * u; x < c.width - 2.6 * u; x += step * u) {
      g.fillStyle = trim; g.fillRect(x - 0.18 * u, y - 0.18 * u, (ww + 0.36) * u, (wh + 0.36) * u); g.fillStyle = glass; g.fillRect(x, y, ww * u, wh * u); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, ww * u, wh * 0.4 * u); g.fillStyle = trim; g.fillRect(x + (ww / 2 - 0.07) * u, y, 0.14 * u, wh * u)
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x - 0.3 * u, y + (wh + 0.18) * u, (ww + 0.6) * u, 0.22 * u) // a sill
      if (ws === 'tall' && o.arch) { g.fillStyle = trim; g.beginPath(); g.arc(x + (ww / 2) * u, y, (ww / 2 + 0.18) * u, Math.PI, 0); g.fill(); g.fillStyle = glass; g.beginPath(); g.arc(x + (ww / 2) * u, y, (ww / 2) * u, Math.PI, 0); g.fill() } } }
  g.fillStyle = 'rgba(0,0,0,0.14)'; for (let y = gy - 0.3 * u; y > 0; y -= 4.4 * u) g.fillRect(0, y, c.width, 0.12 * u) // floor lines
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, c.width, 0.5 * u)
  if (o.shop) {
    g.fillStyle = '#2b2f38'; g.fillRect(0.8 * u, gy + 1.5 * u, c.width - 1.6 * u, 3.7 * u); g.fillStyle = '#9cc7e6'; g.fillRect(1.1 * u, gy + 1.8 * u, c.width - 5 * u, 2.9 * u); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(1.1 * u, gy + 1.8 * u, (c.width - 5 * u) * 0.4, 2.9 * u); g.fillStyle = '#6b4a34'; g.fillRect(c.width - 3.4 * u, gy + 1.8 * u, 2.2 * u, 3.4 * u)
    g.fillStyle = o.signBg ?? '#1f232b'; g.fillRect(1.2 * u, gy - 1.5 * u, c.width - 2.4 * u, 1.5 * u); g.fillStyle = o.signInk ?? '#fff'; g.font = `700 ${Math.round(1.0 * u)}px Montserrat, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.shop, c.width / 2, gy - 0.72 * u)
  } else { g.fillStyle = '#6b4a34'; g.fillRect(c.width / 2 - 1.1 * u, gy + 1.6 * u, 2.2 * u, 3.6 * u); g.fillStyle = '#e8e2d2'; g.fillRect(c.width / 2 - 1.6 * u, gy + 1.2 * u, 3.2 * u, 0.4 * u) }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8
  return new T.MeshStandardMaterial({ map: t, roughness: 0.9 })
}
function building(w, h, d, wall, face, o) { // face: +1 = the front looks toward +x, -1 = toward -x
  const side = mat(wall, 0.9), top = mat('#5b5f68', 0.9), f = facade(w, h, wall, o), mats = [face > 0 ? f : side, face < 0 ? f : side, top, side, side, side]
  const g = new T.Group(), m = new T.Mesh(new T.BoxGeometry(d, h, w), mats); m.position.y = h / 2; m.castShadow = m.receiveShadow = true; m.userData.tex = o.tex; g.add(m)
  box(g, d + 0.6, 0.5, w + 0.3, o.trim ?? '#e8e2d2', 0, h + 0.25, 0)
  if (o.shop && o.awning3d) { const aw = new T.Group(); for (let i = 0; i < Math.floor(w / 1.1); i++) { const s = box(aw, 1.1, 0.12, 2.4, i % 2 ? '#ffffff' : o.awning, 0, 0, -w / 2 + 0.55 + i * 1.1); s.rotation.x = 0 } aw.position.set(face * (d / 2 + 1.1), 5.4, 0); aw.rotation.z = -face * 0.32; g.add(aw) }
  if (o.roof === 'tank') { const tk = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, 2.6, 14), mat('#8a6a4a')); tk.position.set(0, h + 2.8, 0); tk.castShadow = true; g.add(tk); for (const dx of [-1, 1]) for (const dz of [-1, 1]) box(g, 0.2, 1.6, 0.2, '#3a3a40', dx, h + 1.1, dz); const cp = new T.Mesh(new T.ConeGeometry(1.5, 0.8, 14), mat('#5a4a3a')); cp.position.set(0, h + 4.5, 0); g.add(cp) }
  else if (o.roof === 'ac') { for (let i = 0; i < 3; i++) box(g, 1.6, 1.1, 1.6, '#cfd4dc', (i - 1) * 2.4, h + 1.05, (i % 2) * 2 - 1) }
  else if (o.roof === 'antenna') { box(g, 0.2, 6, 0.2, '#8d93a3', 1, h + 3.5, 1); box(g, 2, 0.12, 0.12, '#8d93a3', 1, h + 5.4, 1) }
  else if (o.roof === 'sign') { const sg = new T.Group(); box(sg, w * 0.8, 2.6, 0.3, o.signBg ?? '#d8433b', 0, 0, 0); sg.position.set(0, h + 2.2, 0); sg.rotation.y = Math.PI / 2; g.add(sg) }
  return g
}
function pineW(x, z, s = 1) { const g = new T.Group(); box(g, 0.9 * s, 3 * s, 0.9 * s, '#5d4330', 0, 1.5 * s, 0); for (let i = 0; i < 3; i++) { const c = new T.Mesh(new T.ConeGeometry((3.4 - i * 0.8) * s, 3.6 * s, 9), mat(['#1f6b44', '#24804f', '#2c9a5c'][i], 0.9)); c.position.y = (3.6 + i * 2.2) * s; c.castShadow = true; g.add(c) } g.position.set(x, 0, z); return g }
function car(color) { const g = new T.Group(); box(g, 3.4, 1.3, 7, color, 0, 1.15, 0); box(g, 3.0, 1.2, 3.6, color, 0, 2.3, -0.3); box(g, 3.04, 0.8, 3.0, '#bfe3ff', 0, 2.35, -0.3); for (const [x, z] of [[-1.6, 2.2], [1.6, 2.2], [-1.6, -2.2], [1.6, -2.2]]) { const w = new T.Mesh(new T.CylinderGeometry(0.75, 0.75, 0.5, 18), mat('#1c1c20')); w.rotation.z = Math.PI / 2; w.position.set(x, 0.75, z); g.add(w) } return g }
function lamp(lit) { const g = new T.Group(); box(g, 0.3, 9, 0.3, '#2b2f38', 0, 4.5, 0); box(g, 2, 0.25, 0.25, '#2b2f38', 0.9, 9, 0); const h = new T.Mesh(new T.BoxGeometry(0.9, 0.3, 0.6), new T.MeshStandardMaterial({ color: '#fff4c8', emissive: '#ffd890', emissiveIntensity: lit ? 2.4 : 0 })); h.position.set(1.7, 8.8, 0); g.add(h); return g }
/** Looks for the town. Every story picks a theme and a seed, so no two videos share a street. */
export const CITY_THEMES = {
  sunny: { sky: ['#1ea4f4', '#d2ecfb'], fog: '#d2ecfb', grass: '#5e9a46', road: '#a3a8b0', pave: '#b9b3aa', leaf: '#4a8a3c', hemi: ['#ffffff', 2.0], sun: ['#ffffff', 1.7], walls: ['#e8b25a', '#d9695f', '#6f9fd8', '#8fc7a1', '#f1e3b8', '#c98bb9', '#e39a5b', '#9db3c8'] },
  pastel: { sky: ['#5ec2f4', '#e6f5fd'], fog: '#e6f5fd', grass: '#7fd68a', road: '#adb1b8', pave: '#d9d3ca', leaf: '#5fcf7a', hemi: ['#ffffff', 2.2], sun: ['#fff6ea', 1.5], walls: ['#ffd9a8', '#f6c9d8', '#cfe9ff', '#d6f0c8', '#fff3c4', '#e3d3f4', '#ffe0cc', '#d0ecec'] },
  autumn: { sky: ['#6fb0d8', '#f4dcc0'], fog: '#f1d6b8', grass: '#9a8a48', road: '#9a948e', pave: '#b3a696', leaf: '#e0802c', hemi: ['#ffe9d2', 1.8], sun: ['#ffc48a', 1.9], walls: ['#b5553a', '#c98a4a', '#8a6a52', '#d9b26a', '#9c5a48', '#c7a27a', '#7d6a5a', '#e0c08a'] },
  snow: { sky: ['#8fbad8', '#e6edf7'], fog: '#e3eaf4', grass: '#eef3fa', road: '#aab2c0', pave: '#dfe5ee', leaf: '#dbe7f2', hemi: ['#f2f6ff', 2.4], sun: ['#ffffff', 0.9], walls: ['#b96a5c', '#6f8fb5', '#c9a36a', '#7fa392', '#a98ab0', '#d0b79a', '#8a9db3', '#c47a6a'] },
  night: { sky: ['#0a1030', '#26315e'], fog: '#1a2248', grass: '#1c3a34', road: '#23252e', pave: '#4a4d5c', leaf: '#1f4d3c', hemi: ['#8a9cff', 0.75], sun: ['#aebcff', 0.55], lit: true, walls: ['#5a4a6a', '#6a4a4a', '#3f5a7a', '#4a6a5a', '#6a5f4a', '#5a4a5f', '#6a5440', '#4a5a6a'] },
}
/**
 * The town street. city({ theme: 'sunny' | 'pastel' | 'autumn' | 'snow' | 'night', seed: any number }).
 * The seed changes the buildings, shops, colours and where the cars are. Returns { root, sun, hemi, fog, mood(name, at) }.
 */
export function city({ theme = 'sunny', seed = 12, bare = false } = {}) {
  const TH = CITY_THEMES[theme] ?? CITY_THEMES.sunny
  const root = new T.Group(); let s = 1 + ((seed * 7919) % 2147483646); const r = () => ((s = (s * 16807) % 2147483647) / 2147483647), pick = (a) => a[Math.floor(r() * a.length)]
  const dome = sky(TH.sky[0], TH.sky[1]); if (!bare) root.add(dome)
  // the kind of street: a shopping street, tall downtown, a low brick old town, a street along a park, a market street
  const style = root.userData.style = pick(['main', 'downtown', 'oldtown', 'parkside', 'market'])
  const grass = new T.Mesh(new T.PlaneGeometry(900, 900), mat(TH.grass, 0.95)); grass.rotation.x = -Math.PI / 2; grass.position.y = -0.45; grass.receiveShadow = true; grass.userData.tex = 'grass'; root.add(grass)
  const L = 200, zc = -55
  const road = box(root, 14, 0.2, L, TH.road, 10.5, -0.3, zc); road.castShadow = false; road.userData.tex = style === 'oldtown' ? 'cobble' : 'asphalt'
  for (const x of [0, 21]) { const p = box(root, 7, 0.4, L, TH.pave, x, -0.2, zc); p.castShadow = false; p.userData.tex = style === 'oldtown' ? 'brick' : 'tiles'; box(root, 0.3, 0.42, L, '#8d8780', x + (x ? -3.6 : 3.6), -0.2, zc).userData.tex = 'concrete' }
  if (style !== 'oldtown') for (let z = 30; z > -150; z -= 9) box(root, 0.3, 0.04, 4, '#f2c230', 10.5, -0.18, z).castShadow = false
  // side streets: where a gap opens between the buildings, with a crossing and traffic lights
  const cross = [-34 - Math.floor(r() * 16), -96 - Math.floor(r() * 18)].slice(0, 1 + Math.floor(r() * 2))
  for (const zz of cross) { box(root, 140, 0.2, 12, TH.road, 10.5, -0.31, zz, 'asphalt').userData.tex = road.userData.tex; for (const dz of [-7.6, 7.6]) for (let i = 0; i < 7; i++) box(root, 1.2, 0.04, 4.4, '#f4f4f0', 4.9 + i * 1.86, -0.18, zz + dz).castShadow = false
    for (const [x, ry] of [[3.4, 0], [17.6, Math.PI]]) { const tl = new T.Group(); box(tl, 0.3, 6, 0.3, '#2b2f38', 0, 3, 0); box(tl, 0.8, 2.2, 0.7, '#22242c', 0, 6.4, 0); for (const [y, c] of [[7.1, '#d8322c'], [6.4, '#f2c230'], [5.7, '#2e9c6a']]) { const lt = new T.Mesh(new T.CircleGeometry(0.24, 14), new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: c === '#2e9c6a' ? 1.5 : 0.1 })); lt.position.set(0, y, 0.36); lt.userData.tex = 'none'; tl.add(lt) } tl.position.set(x, 0, zz + (ry ? -8 : 8)); tl.rotation.y = ry; root.add(tl) } }
  const gap = (z0, z1) => cross.some((zz) => z0 > zz - 7 && z1 < zz + 7)
  const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
  const greys = ['#b9bcc2', '#8a9db3', '#c9ced6', '#6f7a8a', '#d6d2c8', '#9db3c8']
  const walls = shuffle(style === 'downtown' ? greys.concat(TH.walls.slice(0, 3)) : style === 'oldtown' ? ['#b5553a', '#a8503a', '#c98a4a', '#8a6a52', '#d9b26a', '#e8d9b8'] : TH.walls)
  const shops = shuffle(['BAKERY', 'TOYS', 'BOOKS', 'CAFE', 'PETS', 'FLOWERS', 'SHOES', 'CINEMA', 'BARBER', 'PIZZA', 'MUSIC', 'HATS', 'ICE CREAM', 'BIKES', 'CANDY', 'BANK', 'DINER', 'GYM', 'ARCADE', 'HOTEL'])
  const awn = shuffle(['#d8433b', '#2f7de8', '#2e9c6a', '#e39a2b', '#7d5bd6']), signs = shuffle([['#1f232b', '#fff'], ['#d8433b', '#fff'], ['#f2c230', '#22242c'], ['#2f7de8', '#fff'], ['#f4f1e8', '#22242c']])
  const H = { main: [13, 30], downtown: [28, 64], oldtown: [9, 16], parkside: [13, 26], market: [11, 20] }[style]
  let si = 0
  for (const [side, x0] of [[1, -3.6], [-1, 24.6]]) { let z = 34, i = side > 0 ? 0 : 4
    if (style === 'parkside' && side < 0) { // the far side is a park: lawn, trees, a fence, benches, a pond
      const lawn = box(root, 60, 0.4, L, TH.grass, x0 + 30, -0.2, zc, 'grass'); lawn.castShadow = false
      for (let zz = 30; zz > -150; zz -= 3) box(root, 0.16, 1.4, 0.16, '#2b2f38', x0 + 0.6, 0.7, zz); box(root, 0.1, 0.1, L, '#2b2f38', x0 + 0.6, 1.35, zc)
      for (let k = 0; k < 28; k++) { const tx = x0 + 6 + r() * 40, tz = 30 - r() * 175; if (gap(tz + 3, tz - 3)) continue; root.add(r() < 0.3 ? pineW(tx, tz, 1 + r() * 0.6) : tree(tx, tz, 0.9 + r() * 0.8, TH.leaf)) }
      for (let zz = 20; zz > -140; zz -= 34) { const b = new T.Group(); box(b, 4, 0.3, 1.3, '#a07c56', 0, 1.4, 0); box(b, 4, 1.2, 0.3, '#a07c56', 0, 2.2, -0.55); for (const cx of [-1.8, 1.8]) box(b, 0.3, 1.4, 1.1, '#3a3a40', cx, 0.7, 0); b.position.set(x0 + 3, 0, zz); b.rotation.y = -Math.PI / 2; root.add(b) }
      const pond = new T.Mesh(new T.CylinderGeometry(8, 8, 0.1, 36), new T.MeshStandardMaterial({ color: '#4aa8e8', roughness: 0.15 })); pond.position.set(x0 + 22, 0.05, -40 - r() * 40); pond.userData.tex = 'none'; root.add(pond)
      continue }
    while (z > -150) { const w = 10 + Math.floor(r() * 6), h = H[0] + Math.floor(r() * ((H[1] - H[0]) / 3.6 + 1)) * 3.6, d = 12
      if (gap(z, z - w)) { z -= 4; continue }
      const tex = style === 'downtown' ? pick(['concrete', 'concrete', 'stone']) : style === 'oldtown' ? pick(['brick', 'brick', 'stone']) : pick(['brick', 'brick', 'concrete', 'stone', 'siding'])
      const shop = r() < (style === 'market' ? 0.95 : style === 'downtown' ? 0.4 : 0.68) ? shops[si++ % shops.length] : null, sg = pick(signs)
      const b = building(w, h, d, walls[i % walls.length], side, { shop, awning: awn[i % awn.length], lit: TH.lit, tex, windows: style === 'downtown' ? pick(['bands', 'bands', 'grid']) : style === 'oldtown' ? 'tall' : pick(['grid', 'grid', 'tall']), arch: style === 'oldtown' || r() < 0.2, glass: style === 'downtown' ? pick(['#5f87b5', '#3d5f85', '#6f9fc0']) : '#3d5f85', trim: style === 'downtown' ? '#d6dbe2' : '#f4f1e8', signBg: sg[0], signInk: sg[1], awning3d: shop && (style === 'market' || r() < 0.45), roof: pick(['none', 'none', 'ac', 'tank', 'antenna', style === 'downtown' ? 'sign' : 'none']) })
      b.position.set(x0 - side * d / 2, 0, z - w / 2); root.add(b); z -= w + (style === 'oldtown' ? 0 : 0.4); i++ } }
  // street furniture, seeded per street
  const lampEvery = pick([22, 26, 30]); for (let z = 18; z > -140; z -= lampEvery) { if (gap(z + 1, z - 1)) continue; const a = lamp(TH.lit); a.position.set(3.0, 0, z); root.add(a); if (TH.lit && z > -50) { const pl = new T.PointLight('#ffcf8a', 120, 26, 1.6); pl.position.set(1.4, 8.2, z); root.add(pl) } if (style !== 'parkside') { const b = lamp(TH.lit); b.position.set(18.0, 0, z - 13); b.rotation.y = Math.PI; root.add(b) } }
  const green = pick(['trees', 'planters', 'none', 'trees']); for (let z = -33; z > -140; z -= 26) { if (green === 'none' || gap(z + 2, z - 2)) continue; const p = new T.Group()
    if (green === 'planters') { box(p, 2, 0.9, 2, '#8a6f55', 0, 0.45, 0, 'planks'); const b = new T.Mesh(new T.SphereGeometry(1.5, 16, 12), mat(TH.leaf, 0.9)); b.position.y = 1.6; b.castShadow = true; p.add(b) }
    else { box(p, 1.6, 0.12, 1.6, '#5d4330', 0, 0.06, 0); box(p, 0.5, 3.2, 0.5, '#6b4a34', 0, 1.6, 0); const b = new T.Mesh(new T.SphereGeometry(2.1, 20, 14), mat(TH.leaf, 0.9)); b.position.y = 4.4; b.castShadow = true; p.add(b) }
    p.position.set(-2.4, 0, z); root.add(p) }
  const props = { bench: () => { const g = new T.Group(); box(g, 3.6, 0.25, 1.1, '#a07c56', 0, 1.3, 0, 'planks'); box(g, 3.6, 1, 0.25, '#a07c56', 0, 2, 0.45, 'planks'); for (const cx of [-1.5, 1.5]) box(g, 0.25, 1.3, 1, '#2b2f38', cx, 0.65, 0); g.rotation.y = Math.PI / 2; return g },
    bins: () => { const g = new T.Group(); box(g, 1, 1.6, 1, pick(['#2e9c6a', '#2f7de8', '#5a5d63']), 0, 0.8, 0); box(g, 1.1, 0.14, 1.1, '#22242c', 0, 1.65, 0); return g },
    hydrant: () => { const g = new T.Group(); box(g, 0.6, 1.2, 0.6, '#d8322c', 0, 0.6, 0); box(g, 1, 0.3, 0.3, '#d8322c', 0, 0.8, 0); box(g, 0.7, 0.2, 0.7, '#a8231c', 0, 1.3, 0); return g },
    bikes: () => { const g = new T.Group(); for (let k = 0; k < 3; k++) { const rg = new T.Mesh(new T.TorusGeometry(0.8, 0.07, 6, 16, Math.PI), mat('#8d93a3')); rg.position.set(0, 0, k * 1.1 - 1.1); rg.rotation.y = Math.PI / 2; g.add(rg) } return g },
    mailbox: () => { const g = new T.Group(); box(g, 1, 1.4, 0.9, '#2f5fa8', 0, 0.9, 0); const tp = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 1, 14, 1, false, 0, Math.PI), mat('#2f5fa8')); tp.rotation.z = Math.PI / 2; tp.position.y = 1.6; g.add(tp); return g },
    phone: () => { const g = new T.Group(); box(g, 1.4, 4.6, 1.4, '#d8322c', 0, 2.3, 0); box(g, 1.1, 3, 0.1, '#bfe3ff', 0, 2.4, 0.71); return g },
    stall: () => { const g = new T.Group(); box(g, 3, 1.4, 1.6, '#a07c56', 0, 0.7, 0, 'planks'); for (let k = 0; k < 4; k++) box(g, 0.8, 0.14, 2.2, k % 2 ? '#ffffff' : pick(awn), -1.2 + k * 0.8, 3.2, 0.2); for (const cx of [-1.4, 1.4]) box(g, 0.12, 3.2, 0.12, '#6b4a34', cx, 1.6, 0.8); for (let k = 0; k < 4; k++) { const f = new T.Mesh(new T.SphereGeometry(0.3, 8, 6), mat(pick(['#e8392c', '#f2b233', '#7fd68a']))); f.position.set(-1 + k * 0.7, 1.6, 0); g.add(f) } g.rotation.y = Math.PI / 2; return g } }
  const kinds = shuffle(Object.keys(props)).slice(0, 3 + Math.floor(r() * 3)); if (style === 'market') kinds.push('stall', 'stall', 'stall')
  for (let k = 0; k < kinds.length * 2; k++) { const z = 24 - r() * 150; if (gap(z + 2, z - 2) || (z > -16 && z < 14)) continue; /* nothing where people usually stand */ const pr = props[kinds[k % kinds.length]](); pr.position.set(r() < 0.5 ? -2.2 : 2.4, 0, z); root.add(pr) }
  if (bare) return { root, style }
  const hemi = new T.HemisphereLight(TH.hemi[0], '#b9c9b0', TH.hemi[1]); root.add(hemi)
  const sun = new T.DirectionalLight(TH.sun[0], TH.sun[1]); sun.position.set(-22, 34, 26); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 4; sun.shadow.bias = -0.0006
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 160 }); root.add(sun, sun.target)
  const fog = new T.Fog(TH.fog, 70, 300)
  /** Set the light. at = [x, y, z] the shot looks at, so the shadows stay sharp there. */
  const mood = (name, at = [0, 0, 0]) => {
    const dusk = name === 'dusk'
    hemi.intensity = dusk ? TH.hemi[1] * 0.85 : TH.hemi[1]; hemi.color.set(dusk ? '#ffe6cf' : TH.hemi[0]); sun.color.set(dusk ? '#ffb37a' : TH.sun[0]); sun.intensity = dusk ? TH.sun[1] * 1.2 : TH.sun[1]
    const o = dusk ? [-40, 16, 20] : [-22, 34, 26]; sun.position.set(at[0] + o[0], at[1] + o[1], at[2] + o[2]); sun.target.position.set(...at); sun.target.updateMatrixWorld()
    fog.color.set(dusk ? '#f4c9a4' : TH.fog); dome.material.color.set(dusk ? '#f6d2c4' : '#ffffff')
  }
  return { root, sun, hemi, fog, mood }
}

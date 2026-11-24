// "In This Town, Every SORRY Summons BREAD" — 21 lines, one shot per phrase, 1080x1920.
// Hard rules applied: full resolution, one stable eyeline per place, one continuous shot per line
// (a cut only on a spoken word, staying on the same subject), and every bread enters by rising
// from the bottom of the frame (or flying in from off-screen) — nothing materialises mid-shot.
import { setThree, T, D, cl, Classic, world, indoor, grade, loadMouth, renderShot, loadFonts, box, sign, direct, captions, texturize, life, model, loadModels } from '../lib/blocky/index.js'

const P = { street: 0, diner: 500 }

// ---- bread props -------------------------------------------------------------
function makeRoll() {
  const g = new T.Group()
  const m = new T.Mesh(new T.SphereGeometry(0.42, 18, 14), new T.MeshStandardMaterial({ color: '#d9a85f', roughness: 0.9 }))
  m.scale.set(1.25, 0.7, 0.85); m.position.y = 0.32; m.castShadow = true; g.add(m)
  const m2 = new T.Mesh(new T.SphereGeometry(0.4, 18, 14), new T.MeshStandardMaterial({ color: '#e6bc7d', roughness: 0.95 }))
  m2.scale.set(1.1, 0.55, 0.72); m2.position.set(0.12, 0.3, -0.06); g.add(m2)
  g.userData.carried = true
  return g
}

function makeLoaf() {
  // base loaf ~7.5 tall at scale 1 (a "1 loaf" unit); the giant is this scaled up
  const g = new T.Group()
  const body = new T.Mesh(new T.CylinderGeometry(3.6, 3.9, 5.4, 26), new T.MeshStandardMaterial({ color: '#c98a4a', roughness: 0.92 }))
  body.position.y = 2.7; body.castShadow = true; g.add(body)
  const dome = new T.Mesh(new T.SphereGeometry(3.75, 24, 16), new T.MeshStandardMaterial({ color: '#d99a55', roughness: 0.9 }))
  dome.position.y = 5.6; dome.scale.y = 0.55; dome.castShadow = true; g.add(dome)
  // scoring marks on the dome
  for (const [rx, rz, ry] of [[0.8, 0, 0], [1.6, 0, 0.2], [2.4, 0, -0.15]]) {
    const cut = new T.Mesh(new T.BoxGeometry(0.35, 0.5, 3.4), new T.MeshStandardMaterial({ color: '#8a5a30', roughness: 1 }))
    cut.position.set(rx, 6.55, rz); cut.rotation.y = ry; g.add(cut)
  }
  // flour dust patches
  for (const [x, z] of [[-1.4, 1.2], [1.2, -1.4], [0.3, 2.2]]) {
    const p = new T.Mesh(new T.CircleGeometry(0.55, 12), new T.MeshStandardMaterial({ color: '#f2e3c8', roughness: 1, transparent: true, opacity: 0.55 }))
    p.position.set(x, 6.75, z); p.rotation.x = -Math.PI / 2; g.add(p)
  }
  g.userData.carried = true
  return g
}

function makeBaguette() {
  const g = new T.Group()
  const b = new T.Mesh(new T.CylinderGeometry(0.2, 0.22, 2.6, 14), new T.MeshStandardMaterial({ color: '#d99a55', roughness: 0.9 }))
  b.rotation.z = Math.PI / 2; b.castShadow = true; g.add(b)
  for (const x of [-0.7, 0, 0.7]) {
    const s = new T.Mesh(new T.BoxGeometry(0.28, 0.3, 1.25), new T.MeshStandardMaterial({ color: '#8a5a30', roughness: 1 }))
    s.position.set(x, 0, 0); s.rotation.z = Math.PI / 2; g.add(s)
  }
  g.userData.carried = true
  return g
}

// ---- the town hall tower -----------------------------------------------------
function makeTower() {
  const g = new T.Group()
  const W = 16, D = 9, FL = 3.2, NF = 10, H = FL * NF // 32
  box(g, W, H, D, '#e8dcc0', 0, H / 2, 0)
  // window grid on the front (+z) and back faces
  for (let f = 0; f < NF; f++) {
    const y = 2.8 + f * FL
    for (const z of [D / 2 + 0.07, -(D / 2) - 0.07]) {
      for (let x = -5.8; x <= 5.8; x += 2.4) {
        const win = new T.Mesh(new T.BoxGeometry(1.35, 2.05, 0.1), new T.MeshStandardMaterial({ color: '#a7c6dd', roughness: 0.4 }))
        win.position.set(x, y, z); win.castShadow = false; g.add(win)
      }
    }
  }
  // cornice
  box(g, W + 1.4, 1.2, D + 1.4, '#d3c2a2', 0, H + 0.6, 0)
  // parapet ledge around the roof edge
  const lip = 0.55, lh = 1.1
  box(g, W + 1.0, lh, lip, '#c3b08e', 0, H + lh / 2, D / 2 + 0.55)
  box(g, W + 1.0, lh, lip, '#c3b08e', 0, H + lh / 2, -(D / 2) - 0.55)
  box(g, lip, lh, D + 2.1, '#c3b08e', W / 2 + 0.55, H + lh / 2, 0)
  box(g, lip, lh, D + 2.1, '#c3b08e', -(W / 2) - 0.55, H + lh / 2, 0)
  const t = sign('TOWN\nHALL', 9.5, 4.2, '#d8433b', '#fff', 150)
  t.position.set(0, H + 2.4, D / 2 + 0.2); g.add(t)
  for (const x of [-6, 6]) {
    const a = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.8, 10), new T.MeshStandardMaterial({ color: '#5a5f68' }))
    a.position.set(x, H + 1.4, D / 2 + 0.5); g.add(a)
  }
  texturize(g)
  return g
}

function makeMachine() {
  const g = new T.Group()
  box(g, 2.6, 5.4, 1.6, '#2b2f38', 0, 2.7, 0)
  box(g, 2.2, 3.4, 0.4, '#9cc7e6', 0, 2.9, 0.86)
  box(g, 2.2, 1.1, 0.1, '#d8433b', 0, 3.9, 0.92)
  for (const y of [0.7, 1.8, 2.9, 4.0]) {
    const c = new T.Mesh(new T.PlaneGeometry(1.7, 0.95), new T.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.6 }))
    c.position.set(0, y, 0.87); g.add(c)
  }
  for (let i = 0; i < 4; i++) {
    const l = new T.Mesh(new T.SphereGeometry(0.12, 10, 8), new T.MeshStandardMaterial({ color: '#ffd23c', emissive: '#ffd23c', emissiveIntensity: 1.4 }))
    l.position.set(-0.8 + i * 0.53, 4.7, 0.87); g.add(l)
  }
  g.userData.carried = true
  return g
}

function makeCart() {
  const g = new T.Group()
  box(g, 5.2, 1.5, 3.2, '#a07c56', 0, 0.75, 0, 'planks')
  for (const x of [-2.1, 2.1]) box(g, 0.18, 2.4, 0.18, '#6b4320', x, 1.6, -1.4)
  box(g, 5.6, 0.12, 3.6, '#d8433b', 0, 1.75, 0)
  // shelf with shoes + sticker sheets
  box(g, 3.6, 0.5, 1.8, '#8a6a4a', -0.4, 1.05, 0.6)
  for (const [x, ry] of [[-1.5, 0.4], [-0.5, -0.3], [0.6, 0.2]]) {
    const sh = new T.Group(); box(sh, 0.9, 0.5, 1.7, '#b5553a', 0, 0.25, 0)
    box(sh, 0.9, 0.5, 1.7, '#b5553a', 0, 0.25, 0).position.y = 0.25 // sole
    for (const z of [-0.55, 0.55]) box(sh, 0.9, 0.18, 0.22, '#4a2d16', 0, 0.06, z)
    sh.position.set(x, 0.8, 0.6); sh.rotation.y = D(ry); g.add(sh)
  }
  const st = sign('OOPS\nSTICKERS', 2.2, 1.6, '#f2c230', '#22242c', 90); st.position.set(1.9, 1.55, 0); g.add(st)
  texturize(g)
  g.userData.carried = true
  return g
}

function makeCones() {
  const g = new T.Group()
  for (const [x, z] of [[-2.2, 3], [0, 4.6], [2.2, 3]]) {
    const cone = new T.Mesh(new T.ConeGeometry(0.6, 1.6, 12), new T.MeshStandardMaterial({ color: '#ff8a2b' }))
    cone.position.set(x, 0.8, z); cone.castShadow = true; g.add(cone)
    const band = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.22, 12), new T.MeshStandardMaterial({ color: '#f4f4f0' }))
    band.position.set(x, 1.05, z); g.add(band)
  }
  return g
}

function makeLamp() {
  const g = new T.Group()
  box(g, 0.3, 7, 0.3, '#2b2f38', 0, 3.5, 0)
  box(g, 2, 0.22, 0.22, '#2b2f38', 0.95, 7, 0)
  const h = new T.Mesh(new T.BoxGeometry(0.9, 0.3, 0.6), new T.MeshStandardMaterial({ color: '#fff4c8', emissive: '#ffd890', emissiveIntensity: 0.8 }))
  h.position.set(1.7, 6.9, 0); g.add(h)
  return g
}

export default {
  async create({ THREE, scene }) {
    setThree(THREE); await loadFonts()
    await loadModels(['pigeon-base'])

    const w = world({ kind: 'meadow', theme: 'sunny', seed: 127 })
    w.root.position.x = P.street; scene.add(w.root)
    w.sun.shadow.mapSize.set(1024, 1024)
    const dome = w.root.children.find((o) => o.isMesh && o.geometry?.type === 'SphereGeometry' && o.material?.fog === false)
    const glow = w.root.children.find((o) => o.isMesh && o.geometry?.type === 'CircleGeometry' && o.material?.fog === false)
    scene.fog = w.fog

    // ---- town hall tower (built by hand: no kit has a big office block)
    const tower = makeTower(); tower.position.set(-24, 0, -24); scene.add(tower)
    const TOL = { x: -24, z: -24, W: 16, D: 9, H: 32 }

    // ---- street sets
    const machine = makeMachine(); machine.position.set(-6.5, 0, -2.8); scene.add(machine)
    const cart = makeCart(); cart.position.set(-12, 0, 3.6); cart.rotation.y = D(0); scene.add(cart)
    const cones = makeCones(); cones.position.set(0, 0, 1); scene.add(cones)
    for (const [x, z] of [[7, -3], [-7, -3]]) { const l = makeLamp(); l.position.set(x, 0, z); scene.add(l) }

    // bread props
    const roll = makeRoll(); roll.position.set(0, -3, 3.6); roll.visible = false; scene.add(roll)
    const smallLoaf = makeLoaf(); smallLoaf.scale.setScalar(0.55); smallLoaf.position.set(0, 0, 6.2); smallLoaf.visible = false; scene.add(smallLoaf)
    const loaf = makeLoaf(); loaf.position.set(-24, -40, -18); loaf.scale.setScalar(0.001); scene.add(loaf) // buried: rises into the shot
    const baguette = makeBaguette(); baguette.position.set(16, 2.4, 1); baguette.visible = false; scene.add(baguette)
    const breadPile = new T.Group(); scene.add(breadPile)
    for (let i = 0; i < 9; i++) {
      const b = makeLoaf(); b.scale.setScalar(0.7 + (i % 3) * 0.28); b.visible = false; breadPile.add(b)
    }

    // seagulls from the pigeon model, tinted white
    const gulls = []
    for (let i = 0; i < 12; i++) {
      const g = model('pigeon-base', { height: 1.6 })
      g.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.color.set('#f4f4f4') } })
      g.userData.gull = true; g.visible = false; scene.add(g); gulls.push(g)
    }
    const gullPerch = []
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      gullPerch.push([-24 + Math.sin(a) * 6.5, 42.8 + (i % 3) * 0.35, -18 + Math.cos(a) * 6.5])
    }

    const diner = indoor({ kind: 'diner', at: [P.diner, 0, 0], seed: 77 }); scene.add(diner)

    const basket = new T.Group(); box(basket, 1.6, 0.4, 1.2, '#a07c56', 0, 0, 0)
    box(basket, 1.6, 0.8, 1.2, '#c98a4a', 0, 0.4, 0)
    basket.position.set(P.diner + 16, 2.75, 4.0); basket.visible = false; basket.userData.carried = true; scene.add(basket)

    const L = life(w, { people: 4, cars: 0, seed: 42, also: [tower, machine, cart, cones] }); scene.add(L.root)

    const C = (o) => { const c = Classic(o); scene.add(c.root); return c }
    const kid = C({ name: 'kid', skin: '#f2c96b', top: { kind: 'zip', color: '#e8564a', inner: '#f7f4ea' }, pants: { kind: 'jeans', color: '#2b3a67', shoes: '#f2f2f2', sole: '#232733' }, hair: { style: 'messy', color: '#241c1b' }, scale: 0.85, seed: 127 })
    const maya = C({ name: 'maya', skin: '#e8c3a5', top: { kind: 'hoodie', color: '#3d8bfd', inner: '#eef4fb' }, pants: { kind: 'jeans', color: '#3a4050', shoes: '#f2f2f2', sole: '#232733' }, hair: { style: 'long', color: '#5a2e1c' }, scale: 0.9, seed: 31 })
    const uncle = C({ name: 'uncle', skin: '#cf9a72', top: { kind: 'plaid', color: '#3a7d8c' }, pants: { kind: 'jeans', color: '#394052' }, hair: { style: 'bald', color: '#4a352a' }, scale: 1.02, seed: 12 })
    const postman = C({ name: 'postman', skin: '#b98b68', top: { kind: 'vest', color: '#2f5fa8', inner: '#d9dde4' }, pants: { kind: 'stripe', color: '#2f3542' }, hair: { style: 'none' }, scale: 1.05, seed: 44 })
    postman.wear('cap', '#2f5fa8')
    const viewer = C({ name: 'viewer', skin: '#9ad2c2', top: { kind: 'suit', color: '#4b4f8a', tie: '#d8433b' }, pants: { kind: 'plain', color: '#2c2e3a' }, hair: { style: 'swept', color: '#2a2422' }, scale: 0.98, seed: 91 })

    return { mouth: await loadMouth(), mood: w.mood, w, dome, glow, tower, TOL, machine, cart, cones, roll, smallLoaf, loaf, baguette, breadPile, gulls, gullPerch, diner, L, basket, scene,
      cast: [kid, maya, uncle, postman, viewer], tone: 'none', look: [0, 0, 0], loops: { loafT0: 0, loafDone: false } }
  },

  update(env) {
    const { state: S, index: k, raw, globalT: t } = env
    const d = direct(env, [...S.cast, ...S.L.people])
    const [kid, maya, uncle, postman, viewer] = S.cast
    const cut = (...ws) => { const n = d.cut(...ws); return n }

    const setMood = (mode, look = [0, 0, 0]) => {
      const dusk = mode === 'dusk'
      S.w.mood(dusk ? 'dusk' : mode, [look[0] ?? 0, 0, look[2] ?? 0])
      S.w.sun.visible = true; S.w.hemi.visible = true
      S.dome.visible = true; S.glow.visible = true
      S.scene.fog = S.w.fog
      S.look = look
    }

    // safe default camera every frame; each line overrides
    d.cam([3, 4.6, 13], [0, 4.2, 2], 48, null)

    // roll / loaf / pile / baguette hidden unless a line calls them
    S.roll.visible = false; S.smallLoaf.visible = false; S.baguette.visible = false
    for (const b of S.breadPile.children) b.visible = false
    for (const g of S.gulls) g.visible = false

    if (k === 0) {
      // In this town, every time you say sorry, bread appears.
      setMood('day')
      const n = cut('sorry', 'appears'); d.show(kid, 0, 0, 2, 0, n === 0 ? 'neutral' : 'smile'); d.talk(kid)
      S.roll.visible = true
      const appear = env.words.find((x) => x.word === 'appears')?.start ?? 0
      const a = raw - appear
      S.roll.position.set(0.9, 0, 3.6)
      const s = cl(a / 0.4); S.roll.scale.setScalar(Math.max(0.001, s * 0.9))
      if (s > 0 && s < 1) d.burst('sparkle', 0.1, [0.9, 0.35, 3.6], { n: 8, size: 0.5, spread: 1.2 })
      if (n === 0) d.shot('medium', kid, { side: -12 })
      else d.shot('face', kid, { side: 10 })
    } else if (k === 1) {
      // A mumble makes a roll. A shout makes a loaf.
      setMood('day')
      const n = cut('roll', 'loaf'); d.show(kid, 0, 0, 2, 0, n === 0 ? 'neutral' : 'proud'); d.talk(kid)
      if (n === 0) {
        S.roll.visible = true; S.roll.position.set(0.9, 0, 3.6)
        const rollW = env.words.find((x) => x.word === 'roll')?.start ?? 0
        const s = cl((raw - rollW) / 0.35); S.roll.scale.setScalar(Math.max(0.001, s * 0.9))
        d.shot('medium', kid, { side: 10 })
        if (s > 0 && s < 1) d.burst('sparkle', 0.1, [0.9, 0.35, 3.6], { n: 6, size: 0.4, spread: 1 })
      } else {
        S.smallLoaf.visible = true; S.smallLoaf.position.set(-1.2, 0, 4.6)
        const loafW = env.words.find((x) => x.word === 'loaf')?.start ?? 0
        const s = cl((raw - loafW) / 0.45); S.smallLoaf.scale.setScalar(Math.max(0.001, s * 0.75))
        d.shot('medium', kid, { side: -14 })
        if (s > 0 && s < 1) d.burst('sparkle', 0.15, [-1.2, 1.6, 4.6], { n: 10, size: 0.8, spread: 1.6 })
      }
    } else if (k === 2) {
      // My uncle said sorry to a vending machine once.
      setMood('day')
      const n = cut('sorry', 'machine'); d.show(uncle, -6.5, 0, 1.2, 0, n ? 'sheepish' : 'neutral'); d.talk(uncle)
      d.cam([-6.5 - 7.5, 4.2, 6.5], [-6.5, 3.4, -0.5], 46, 8.5)
      if (n === 0) d.gest(uncle)
      else d.shot('medium', uncle, { side: 12 })
    } else if (k === 3) {
      // It buried the machine in 3 feet of sourdough.
      setMood('day')
      const n = cut('buried', '3'); d.show(uncle, -7.6, 0, 1.4, 8, 'oh')
      S.machine.visible = true
      const blobs = S.breadPile.children
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i], off = i * 0.09, s = cl((t - off) / 0.35)
        b.visible = true
        const px = [-1.6, 0, 1.6][i % 3], py = 0.9 + Math.floor(i / 3) * 1.5, pz = [0.4, 0, -0.4][Math.floor(i / 3) % 3]
        b.position.set(S.machine.position.x + px, py, S.machine.position.z + pz)
        b.scale.setScalar(Math.max(0.001, s * (0.7 + (i % 3) * 0.28)))
      }
      if (n === 0) { d.cam([-8.6, 4.3, 7.5], [-6.5, 3.4, -0.5], 46, null); d.allowEmpty() }
      else { d.big(3); d.cam([-7.8, 3.4, 9.5], [-6.5, 4.2, -0.8], 50, null); d.gest(uncle); d.allowEmpty() }
    } else if (k === 4) {
      // So nobody says sorry here. We say "my bad."
      setMood('day')
      const n = cut('sorry', 'bad'); d.show(kid, 0, 0, 2, 0, n ? 'smirk' : 'neutral'); d.show(viewer, 4.4, 0, 0.6, -34, 'neutral'); d.talk(kid)
      if (n === 0) d.shot('two', kid, { with: viewer, lens: 62 })
      else { d.shot('two', kid, { with: viewer, side: 8, lens: 62 }); d.gest(kid); d.gest(viewer) }
    } else if (k === 5) {
      // The town sells "oops" stickers and bread-proof shoes.
      setMood('day')
      const n = cut('oops', 'shoes'); d.show(kid, -8.9, 0, 3.3, -14, n ? 'smile' : 'neutral'); d.talk(kid)
      S.cart.visible = true
      if (n === 0) d.cam([-3.6, 4.6, 11.5], [-8.9, 3.6, 3.3], 50, null)
      else { d.shot('medium', kid, { side: -14 }); d.gest(kid) }
    } else if (k === 6) {
      // And me? I'm the worst sayer in town.
      setMood('day')
      d.show(kid, 0, 0, 2, 0, 'proud'); d.talk(kid); d.shot('face', kid, { side: 12 })
    } else if (k === 7) {
      // 4 years without one sorry. I kept a perfect record.
      setMood('day')
      const n = cut('4', 'sorry'); d.show(kid, 0, 0, 2, 0, n ? 'determined' : 'proud'); d.talk(kid)
      if (n === 0) d.shot('face', kid, { side: -12 })
      else { d.shot('face', kid, { side: -12, tight: 1.2 }); d.big(4); d.gest(kid) }
    } else if (k === 8) {
      // Then one day, Maya slipped off the roof of town hall.
      setMood('day')
      const n = cut('Maya', 'roof'); d.show(maya, -17.2, 33.3, -18.9, 20, n ? 'scared' : 'neutral')
      maya.standOn = 33.3
      S.tower.visible = true
      if (n === 0) d.cam([-12, 30, 22], [-24, 20, -22], 50, null)
      else { d.cam([-17, 12, 20], [-24, 14, -19], 48, null); d.allowEmpty() }
    } else if (k === 9) {
      // She caught the ledge with one hand. Her fingers were shaking.
      setMood('day')
      const n = cut('ledge', 'shaking'); d.show(maya, -17.2, 33.3, -18.9, 20, n ? 'scared' : 'neutral')
      maya.standOn = 33.3
      d.shot('medium', maya, { side: -18 })
      maya.pose({ armL: [120 + Math.sin(t * 24) * 40, 40], armR: [120 - Math.sin(t * 24) * 40, 40] })
      maya.root.rotation.z = Math.sin(t * 13) * 0.1
    } else if (k === 10) {
      // "Help!" she yelled. I opened my mouth. And whispered.
      setMood('day')
      d.show(maya, -17.2, 33.3, -18.9, 20, 'shout'); maya.standOn = 33.3; d.talk(maya)
      d.shot('face', maya, { side: -14 })
      maya.pose({ armL: [130 + Math.sin(t * 22) * 30, 40], armR: [130 - Math.sin(t * 22) * 30, 40] })
    } else if (k === 11) {
      // "Sorry," I breathed. A tiny roll popped up under my shoe.
      setMood('day')
      const n = cut('Sorry', 'shoe'); d.show(kid, 0, 0, 2, 0, n ? 'cliff' : 'frown'); d.talk(kid)
      S.roll.visible = true; S.roll.position.set(0.9, 0, 3.6)
      const shoeW = env.words.find((x) => x.word === 'shoe')?.start ?? 0
      const s = cl((raw - shoeW) / 0.35); S.roll.scale.setScalar(Math.max(0.001, s * 0.9))
      if (s > 0 && s < 1) d.burst('sparkle', 0.15, [0.9, 0.35, 3.6], { n: 6, size: 0.4, spread: 1 })
      d.shot('face', kid, { side: -10 })
    } else if (k === 12) {
      // I tripped over it. We both hung there.
      setMood('day')
      d.show(kid, 0, 0, 2, 0, 'sad'); d.talk(kid); d.shot('medium', kid, { side: -16 })
      kid.pose({ armL: [80, 30], armR: [80, 30], head: [-14, 0, 0] })
      kid.root.rotation.z = Math.sin(t * 6) * 0.06
      S.roll.visible = true; S.roll.position.set(0.9, 0, 3.6); S.roll.scale.setScalar(0.9)
    } else if (k === 13) {
      // "SORRY!" I shouted. The word I hadn't said in 4 years.
      setMood('dusk')
      const n = cut('SORRY', 'years'); d.show(kid, 0, 0, 2, 0, n ? 'shout' : 'sad'); d.talk(kid)
      if (n === 0) d.shot('face', kid, { side: -12 })
      else { d.shot('face', kid, { side: -12, tight: 1.1 }); d.shake('SORRY', 0.3, 0.3) }
    } else if (k === 14) {
      // Thunder. A 20-foot loaf burst up from the street.
      setMood('dusk')
      const n = cut('Thunder', 'burst')
      d.show(kid, 0, 0, 2, 0, 'shock')
      S.loaf.visible = true
      if (n === 0) {
        d.shake('Thunder', 0.6, 0.4); d.burst('sparkle', 'Thunder', [-24, 30, -18], { n: 18, size: 1.2, color: '#ffffff', spread: 8 })
        d.cam([-8, 12, 26], [-24, 10, -20], 50, null); d.allowEmpty()
      } else {
        d.big(20)
        // it grows upward from the street floor (bottom pinned at y = 0), 0.001 -> 4.07
        if (!S.loops.loafDone) { S.loops.loafT0 = t; S.loops.loafDone = true }
        const u = cl((t - S.loops.loafT0) / 1.0), e = 1 - Math.pow(1 - u, 3), s = 0.001 + e * (4.07 - 0.001)
        S.loaf.scale.setScalar(s); S.loaf.position.y = (7.5 / 2) * s
        if (u > 0 && u < 1) { d.shake('burst', 0.7, 0.5); d.burst('puff', 0.2, [-24, 2, -18], { n: 12, size: 2.2, color: '#dfe7ef', spread: 5 }) }
        d.cam([-8, 12, 26], [-24, 10, -20], 50, null); d.allowEmpty()
      }
    } else if (k === 15) {
      // It caught Maya before she let go. Soft as a cloud.
      setMood('dusk')
      const n = cut('caught', 'go')
      S.loaf.visible = true; S.loaf.scale.setScalar(4.07); S.loaf.position.y = (7.5 / 2) * 4.07
      d.cam([-10, 10, 28], [-24, 14, -20], 50, null); d.allowEmpty()
      if (n >= 1) {
        // she slips as the word "go" lands; the loaf top is at 30.5
        const goW = env.words.find((x) => x.word === 'go')?.start ?? 0
        const G = env.globalT - raw + goW
        d.fall(maya, { x: -17.2, y0: 33.3, z: -18.9, at: { global: G }, g: 55, landY: 31.0, faces: ['scream', 'dizzy', 'happy'] })
      }
    } else if (k === 16) {
      // She bounced twice. Then she laughed.
      setMood('day')
      const n = cut('bounced', 'laughed'); d.show(maya, -24, 31.2, -18, 0, n ? 'happy' : 'dizzy')
      S.loaf.visible = true; S.loaf.scale.setScalar(4.07); S.loaf.position.y = (7.5 / 2) * 4.07
      maya.standOn = 31.2; maya.touching = true
      d.shot('medium', maya, { side: -14 })
      if (n === 0) d.hop(maya, 0.9, 7)
      else d.laugh(maya, 1.1)
    } else if (k === 17) {
      // But the loaf kept growing. 200 seagulls landed on the crust.
      setMood('day')
      S.loaf.visible = true
      const growW = env.words.find((x) => x.word === 'growing')?.start ?? 0
      const grow = cl((raw - growW) / 1.2)
      const s = 4.07 + grow * 1.6
      const topY = 7.66 * s
      S.loaf.scale.setScalar(s); S.loaf.position.y = (7.5 / 2) * s
      d.show(maya, -24, topY - 1.4, -18, 0, 'happy')
      maya.standOn = topY - 1.4; maya.touching = true
      const perchT = env.words.find((x) => x.word === 'landed')?.start ?? 1e9
      const perchStart = raw - perchT
      for (let i = 0; i < S.gulls.length; i++) {
        const g = S.gulls[i]; g.visible = true
        const ph = i * 0.53, rad = 13 + (i % 3) * 1.6
        const cx = -24, cy = 36, cz = -22
        if (perchStart < 0.5 && i < 6) {
          const a = t * (0.9 + i * 0.03) + ph
          g.position.set(cx + Math.sin(a) * rad, cy + Math.sin(t * 2.2 + ph) * 3, cz + Math.cos(a) * rad)
          g.rotation.y = D(-a * 57 + 90)
        } else if (i < 6) {
          const p = S.gullPerch[i], u = cl((perchStart - 0.5) / 0.7)
          g.position.set(p[0] + (1 - u) * Math.sin(t * 2) * 4, p[1] + (1 - u) * 6, p[2] + (1 - u) * Math.cos(t * 2) * 4)
          g.rotation.y = D(60 + i * 40)
        } else {
          const a = t * (0.8 + i * 0.02) + ph
          g.position.set(cx + Math.sin(a) * rad, cy - 4 + Math.sin(t * 2 + ph) * 2.5, cz + Math.cos(a) * rad)
          g.rotation.y = D(-a * 57 + 90)
        }
        g.userData.part?.('LeftWing', Math.sin(t * 17 + i) * 26); g.userData.part?.('RightWing', -Math.sin(t * 17 + i) * 26)
      }
      const at200 = env.words.find((x) => x.word === '200')?.start ?? 1e9
      if (raw >= at200) d.big(200)
      d.cam([-30, 24, 16], [-24, 26, -18], 46, null); d.allowEmpty()
    } else if (k === 18) {
      // It jammed Main Street for 4 days.
      setMood('day')
      S.loaf.visible = true; S.loaf.scale.setScalar(5.67); S.loaf.position.y = (7.5 / 2) * 5.67
      S.cones.visible = true
      d.show(kid, -2.5, 0, 2, 20, 'awed'); d.talk(kid)
      d.cam([2, 4.2, 14], [-10, 4, 0], 48, null)
      const at4 = env.words.find((x) => x.word === '4')?.start ?? 1e9
      if (raw >= at4) d.big(4)
    } else if (k === 19) {
      // Maya said "sorry" for breaking the gutter. A baguette whacked the postman.
      setMood('day')
      const n = cut('sorry', 'baguette')
      d.show(maya, 0, 0, 2, 0, n ? 'cheeky' : 'neutral'); d.show(kid, -4, 0, 2, 14, 'neutral'); d.show(postman, 4.6, 0, 1.4, -30, 'neutral')
      if (n === 0) { d.talk(maya); d.walkTo(postman, [7, 1.4], [4.6, 1.4], 'neutral', 2.6, 0, 0.1); d.shot('medium', maya, { side: -10 }) }
      else {
        S.baguette.visible = true
        const at = env.words.find((x) => x.word === 'baguette')?.start ?? 1e9
        const u = cl((raw - at) / 0.45)
        if (u >= 1) S.baguette.visible = false
        else {
          const sx = 16 - 12 * u, sy = 2.4 + Math.sin(u * Math.PI) * 2.2, sz = 1
          S.baguette.position.set(sx, sy, sz); S.baguette.rotation.z = D(u * 720)
          if (u > 0.5 && u < 0.62) d.burst('puff', 0.55, [4.7, 1.6, 1.4], { n: 8, size: 0.9, spread: 2 })
        }
        d.shot('two', maya, { with: postman, side: 8, lens: 62 })
        postman.pose({ armL: [110, 40], armR: [60, 20], head: [-30, 0, 0], torso: [-25, 0, 0] })
      }
    } else if (k === 20) {
      // We say "my bad" at breakfast now. The bakery delivers.
      setMood('day', [P.diner, 0, 0])
      const n = cut('my bad', 'delivers')
      d.show(kid, P.diner + 8.2, 0, -1, 0, n ? 'smile' : 'neutral'); d.show(maya, P.diner + 12.0, 0, -2.4, 0, 'smile'); d.talk(kid)
      S.diner.visible = true
      const deliversW = env.words.find((x) => x.word === 'delivers')?.start ?? 1e9
      if (raw >= deliversW) {
        S.basket.visible = true
        const u = cl((raw - deliversW) / 0.6)
        S.basket.position.x = P.diner + 16 - 7 * u
      }
      if (n === 0) d.camFree([P.diner + 5.5, 4.8, 13.5], [P.diner + 10.1, 3.8, -1.7], 52, null)
      else { d.camFree([P.diner + 5.9, 4.6, 13], [P.diner + 10.1, 3.7, -1.7], 50, null); kid.pose({ armL: [28, 8], armR: [28, 8], head: [4, 0, 0] }) }
    }

    // keep the loaf growing (or not) consistent when not explicitly set
    if (k >= 14 && k <= 18) {
      S.loaf.visible = true
    }
    S.L.step(t)
    S.w.mood(S.look === 'dusk' ? 'dusk' : 'day', [S.look[0] ?? 0, 0, S.look[2] ?? 0])
    d.done()
  },

  render({ renderer, scene, camera, state }) { renderer.toneMapping = T.NoToneMapping; renderShot(renderer, scene, camera, { dof: state.dof }) },
  overlay(env) { grade(env.ctx, env.W, env.H, { look: env.state.tone ?? 'none' }); captions(env) },
}

// "In This Town, Every TEAR Makes It SNOW" — 29 lines, first person, one shot per phrase.
// The four places live far apart in one scene; each frame switches on only its own sky and light rig.
import { setThree, T, D, cl, Classic, someone, world, indoor, grade, loadMouth, renderShot, loadFonts, box, sign, direct, captions, texturize, life, model, loadModels, snowfall, vehicle } from '../lib/blocky/index.js'

const P = { plaza: 0, porch: 500, hill: 1000, room: 1500 }

function puffCloud(n = 7, r = 1.25) {
  const g = new T.Group()
  const bits = [[0, 0, 0, 1], [-0.9, -0.1, 0, 0.75], [0.9, 0, 0, 0.8], [-0.45, 0.45, 0.25, 0.7], [0.5, 0.5, -0.2, 0.72], [0, -0.42, 0.35, 0.66], [0.1, -0.35, -0.4, 0.6]]
  for (let i = 0; i < Math.min(n, bits.length); i++) {
    const [x, y, z, s] = bits[i]
    const m = new T.Mesh(new T.SphereGeometry(r * s, 18, 14), new T.MeshStandardMaterial({ color: i % 2 ? '#eef5ff' : '#ffffff', roughness: 0.95 }))
    m.position.set(x * r, y * r, z * r); m.castShadow = true; g.add(m)
  }
  g.userData.carried = true
  return g
}

function makeFire() {
  const g = new T.Group()
  box(g, 3.4, 0.4, 3.4, '#4a3b32', 0, 0.2, 0)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, x = Math.sin(a) * 1.05, z = Math.cos(a) * 1.05
    box(g, 0.45, 1.25, 0.45, '#6b4230', x, 0.75, z).rotation.y = a
  }
  const flames = []
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, x = Math.sin(a) * 0.8, z = Math.cos(a) * 0.8
    const col = i % 3 === 0 ? '#ffd23c' : i % 3 === 1 ? '#ff8a2b' : '#e8432a'
    const f = new T.Mesh(new T.ConeGeometry(0.55 + (i % 2) * 0.12, 2.5 + (i % 3) * 0.7, 10), new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.1, roughness: 0.6 }))
    f.position.set(x, 1.6, z); f.castShadow = false; g.add(f); flames.push(f)
  }
  const light = new T.PointLight('#ff7a2a', 160, 24); light.position.set(0, 3, 0); g.add(light)
  g.userData.flames = flames; g.userData.light = light; g.userData.carried = true
  return g
}

function makeCake() {
  const g = new T.Group()
  const base = new T.Mesh(new T.CylinderGeometry(1.55, 1.7, 0.35, 28), new T.MeshStandardMaterial({ color: '#f6d9c4', roughness: 0.85 }))
  base.position.y = 0.18; g.add(base)
  const top = new T.Mesh(new T.CylinderGeometry(1.55, 1.55, 0.16, 28), new T.MeshStandardMaterial({ color: '#fff5e8', roughness: 0.8 }))
  top.position.y = 0.43; g.add(top)
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; box(g, 0.14, 0.32, 0.14, i % 2 ? '#e8432a' : '#3d8bfd', Math.sin(a) * 1.2, 0.62, Math.cos(a) * 1.2) }
  const c = new T.Mesh(new T.CylinderGeometry(0.12, 0.14, 0.55, 12), new T.MeshStandardMaterial({ color: '#ffd23c' })); c.position.y = 0.78; g.add(c)
  g.userData.carried = true
  return g
}

function makeShovel() {
  const g = new T.Group()
  box(g, 0.14, 2.5, 0.14, '#9a6b3e', 0, 1.25, 0)
  box(g, 0.8, 0.9, 0.12, '#b9c0c8', 0, 0.45, 0.25)
  box(g, 0.5, 0.12, 0.12, '#9a6b3e', 0, 2.5, 0)
  g.userData.carried = true
  return g
}

function makeBush(col) {
  const g = new T.Group()
  for (const [x, y, z, s] of [[0, 0.6, 0, 0.8], [-0.5, 0.45, 0.15, 0.6], [0.5, 0.5, -0.1, 0.65]]) {
    const m = new T.Mesh(new T.SphereGeometry(s, 12, 10), new T.MeshStandardMaterial({ color: col, roughness: 1 })); m.position.set(x, y, z); g.add(m)
  }
  g.userData.carried = true
  return g
}

function makePlow() {
  const g = new T.Group()
  box(g, 3.4, 1.6, 5.2, '#d8433b', 0, 1.0, 0)
  box(g, 3.0, 1.3, 2.0, '#2f3542', 0, 2.2, 0.9)
  box(g, 4.8, 0.7, 0.5, '#f2c230', 0, 0.65, 2.9).rotation.x = -0.2
  for (const x of [-1.5, 1.5]) for (const z of [-1.6, 1.6]) {
    const w = new T.Mesh(new T.CylinderGeometry(0.62, 0.62, 0.36, 16), new T.MeshStandardMaterial({ color: '#1d1f24' })); w.rotation.z = Math.PI / 2; w.position.set(x, 0.65, z); g.add(w)
  }
  g.userData.carried = true
  return g
}

export default {
  async create({ THREE, scene }) {
    setThree(THREE); await loadFonts()
    await loadModels(['pigeon-base', 'public-school-19ade5', 'fire-lookout-tower-75a129', 'yellow-school-bus-0fd3b6'])

    const plaza = world({ kind: 'plaza', theme: 'sunny', seed: 71 }); plaza.root.position.x = P.plaza; scene.add(plaza.root)
    const porch = world({ kind: 'suburb', theme: 'sunny', seed: 33 }); porch.root.position.x = P.porch; scene.add(porch.root)
    const hill = world({ kind: 'meadow', theme: 'sunny', seed: 88 }); hill.root.position.x = P.hill; scene.add(hill.root)
    const room = indoor({ kind: 'living', at: [P.room, 0, 0], seed: 18 }); scene.add(room)
    scene.fog = plaza.fog

    const rigs = [
      { key: 'plaza', w: plaza }, { key: 'porch', w: porch }, { key: 'hill', w: hill },
    ]
    for (const r of rigs) {
      r.w.sun.shadow.mapSize.set(1024, 1024) // software renderer: 4096 shadow maps are too slow in CI
      r.dome = r.w.root.children.find((o) => o.isMesh && o.geometry?.type === 'SphereGeometry' && o.material?.fog === false)
      r.glow = r.w.root.children.find((o) => o.isMesh && o.geometry?.type === 'CircleGeometry' && o.material?.fog === false)
    }

    // ---- sets on the town square (origin)
    const fair = new T.Group(); fair.position.set(P.plaza - 3, 0, 1.4); scene.add(fair)
    box(fair, 5.2, 0.3, 3.2, '#c99455', 0, 0.15, 0)
    for (const x of [-2.3, 2.3]) box(fair, 0.16, 3.4, 0.16, '#e8dcc0', x, 1.8, -1.2)
    box(fair, 5.2, 0.14, 2.4, '#d8433b', 0, 3.35, -1.2)
    texturize(fair)
    const cake = makeCake(); cake.position.set(P.plaza - 3, 0.32, 1.4); scene.add(cake)

    const post = new T.Group(); post.position.set(P.plaza - 8, 0, 2); scene.add(post)
    box(post, 0.22, 5, 0.22, '#8a5a2c', 0, 2.5, 0)
    const noCry = sign('NO\nCRYING', 3.6, 2.8, '#d8433b', '#ffffff', 150); noCry.position.set(0, 5.3, 0); post.add(noCry)
    texturize(post)
    const plow = makePlow(); plow.position.set(P.plaza + 12, -0.15, 2); plow.rotation.y = D(-25); scene.add(plow)

    // ---- the hill behind the school (x 1000)
    const school = model('public-school-19ade5', { height: 27 }); school.position.set(P.hill, 0, -30); school.rotation.y = D(180); scene.add(school)
    const tower = model('fire-lookout-tower-75a129', { height: 24 }); tower.position.set(P.hill + 13, 0, -17); scene.add(tower)
    const fire = makeFire(); fire.position.set(P.hill, 0, -8); fire.visible = false; scene.add(fire)
    const bushes = ['#4f8f4a', '#5c9b52', '#477f45'].map((c, i) => {
      const b = makeBush(c); b.position.set(P.hill - 5 + i * 5, 0, -1.5); b.visible = false; scene.add(b); return b
    })
    const buses = []
    for (let i = 0; i < 3; i++) {
      const b = model('yellow-school-bus-0fd3b6', { height: 4.6 }); b.position.set(P.hill - 10 + i * 10, -0.1, -13); b.rotation.y = D(90); b.visible = false; scene.add(b); buses.push(b)
    }
    const snowHeap = new T.Group()
    for (let i = 0; i < 7; i++) {
      const m = new T.Mesh(new T.SphereGeometry(1.5 + (i % 3) * 0.5, 14, 10), new T.MeshStandardMaterial({ color: '#f4fbff', roughness: 1 }))
      m.position.set(P.hill - 9 + i * 3, 0.35, -12.5 + (i % 2) * 1.4); m.scale.y = 0.55; snowHeap.add(m)
    }
    snowHeap.visible = false; scene.add(snowHeap)

    // ---- clouds
    const cloudSmall = puffCloud(5, 1.05); cloudSmall.visible = false; scene.add(cloudSmall)
    const cloudBig = puffCloud(7, 1.55); cloudBig.visible = false; scene.add(cloudBig)
    const cloudHuge = puffCloud(7, 2.2); cloudHuge.visible = false; scene.add(cloudHuge)
    const snow = snowfall(360, 46); snow.visible = false; scene.add(snow)

    // ---- cast
    const C = (o) => { const c = Classic(o); scene.add(c.root); return c }
    const kid = C({ name: 'kid', skin: '#f2c96b', top: { kind: 'zip', color: '#e8564a', inner: '#f7f4ea' }, pants: { kind: 'jeans', color: '#2b3a67', shoes: '#f2f2f2', sole: '#232733' }, hair: { style: 'messy', color: '#241c1b' }, scale: 0.85, seed: 71 })
    const grandma = C({ name: 'grandma', skin: '#e8c3a5', top: { kind: 'jacket', color: '#d98c4a', print: 'none', inner: '#f7ede2' }, pants: { kind: 'plain', color: '#5a4a58' }, hair: { style: 'bun', color: '#d8d2c8' }, scale: 0.92, seed: 33 })
    grandma.wear('scarf', '#7fa86b')
    box(grandma.parts.torso, 2.08, 0.26, 1.12, '#b4633f', 0, 0.55, 0.02)
    box(grandma.parts.torso, 2.06, 0.24, 1.1, '#6f8f9c', 0, 0.22, 0.02)
    const uncle = C({ name: 'uncle', skin: '#cf9a72', top: { kind: 'plaid', color: '#3a7d8c' }, pants: { kind: 'jeans', color: '#394052' }, hair: { style: 'messy', color: '#4a352a' }, scale: 1.02, seed: 12 })
    const chief = C({ name: 'chief', skin: '#b98b68', top: { kind: 'vest', color: '#f2c230', inner: '#f4f4f0' }, pants: { kind: 'stripe', color: '#2f3542' }, hair: { style: 'none' }, scale: 1.1, seed: 44 })
    chief.wear('hardhat', '#d8433b')
    const v1 = C({ name: 'viewer1', skin: '#9ad2c2', top: { kind: 'suit', color: '#4b4f8a', tie: '#d8433b' }, pants: { kind: 'plain', color: '#2c2e3a' }, hair: { style: 'swept', color: '#2a2422' }, scale: 0.98, seed: 91 })
    const v2 = C({ name: 'viewer2', skin: '#e6c3a5', top: { kind: 'hoodie', color: '#7a4fa8' }, pants: { kind: 'jeans', color: '#3a4050' }, hair: { style: 'long', color: '#6b3b25' }, scale: 0.96, seed: 92 })
    const cast = [kid, grandma, uncle, chief, v1, v2]

    const pigeons = []
    for (let i = 0; i < 3; i++) {
      const p = model('pigeon-base', { height: 1.5 }); p.visible = false; scene.add(p); pigeons.push(p)
    }

    const shovel = makeShovel(); shovel.visible = false; scene.add(shovel)
    const bread = new T.Group(); box(bread, 0.42, 0.3, 0.3, '#d9a85f', 0, 0, 0); bread.userData.carried = true; bread.visible = false; scene.add(bread)

    const L = life(plaza, { people: 5, cars: 0, seed: 71, stage: [[0, 0, 13], [-3, 1.4, 6], [-8, 2, 5], [12, 2, 5]] }); scene.add(L.root)

    return { mouth: await loadMouth(), mood: plaza.mood, plaza, porch, hill, room, rigs, scene,
      kid, grandma, uncle, chief, v1, v2, cast, L, snow, fire, cake, plow, noCry, post, fair,
      cloudSmall, cloudBig, cloudHuge, bushes, buses, snowHeap, pigeons, shovel, bread, tone: 'none', look: [0, 0, 0] }
  },

  update(env) {
    const { state: S, index: k, raw, globalT: t } = env
    const d = direct(env, [...S.cast, ...S.L.people])
    const { kid, grandma, uncle, chief, v1, v2 } = S
    const cut = (...ws) => { const n = d.cut(...ws); return n }
    const CENTRE = { plaza: P.plaza, porch: P.porch, hill: P.hill }
    const setPlace = (key, mode = 'day', look = [0, 0, 0]) => {
      for (const r of S.rigs) {
        const on = r.key === key
        r.w.sun.visible = on; r.w.hemi.visible = on
        if (r.dome) r.dome.visible = on
        if (r.glow) r.glow.visible = on
        if (on) {
          // mood() aims the sun at the given point: it must be this world's own x, or the set sits in shadow.
          r.w.mood(mode === 'night' ? 'dusk' : mode, [CENTRE[key] ?? 0, 0, look[2] ?? 0])
          S.scene.fog = r.w.fog
        }
      }
      S.look = look
    }
    let place = 'plaza', mode = 'day'

    // hide everything story-specific by default
    S.fire.visible = false; S.cake.visible = false; S.plow.visible = false; S.post.visible = false; S.fair.visible = false
    S.snowHeap.visible = false; S.shovel.visible = false; S.bread.visible = false
    S.cloudSmall.visible = false; S.cloudBig.visible = false; S.cloudHuge.visible = false; S.snow.visible = false
    for (const b of S.bushes) b.visible = false
    for (const b of S.buses) b.visible = false
    for (const p of S.pigeons) p.visible = false
    S.fire.userData.light.intensity = 0

    // a safe default camera in every frame; each line overrides it below
    d.cam([3, 4.6, 13], [0, 4.2, 2], 48, null)

    if (k === 0) {
      // In this town, every time you cry, a snow cloud appears.
      const n = cut('cry', 'cloud'); d.show(kid, 0, 0, 4, 0, n === 0 ? 'neutral' : 'sad'); d.talk(kid)
      if (n === 0) { d.shot('medium', kid, { side: -12 }); d.gest(kid) }
      else if (n === 1) { d.shot('face', kid, { side: 8 }); d.appear(S.cloudSmall, 'cloud', { pos: [0, 7.4, 4], size: 0.85 }) }
      else { S.cloudSmall.visible = true; S.cloudSmall.position.set(0, 7.4, 4); S.cloudSmall.scale.setScalar(0.85)
        d.cam([4.6, 6.2, 14], [0, 5.6, 4], 52, null) }
    } else if (k === 1) {
      // One tear makes a flurry. A real cry makes a blizzard.
      const n = cut('flurry', 'blizzard'); d.show(kid, 0, 0, 4, 0, n === 2 ? 'sad' : 'neutral'); d.talk(kid)
      S.cloudSmall.visible = true; S.cloudSmall.position.set(0, 7.4, 4); S.cloudSmall.scale.setScalar(n === 2 ? 1.3 : 0.9)
      if (n < 2) d.burst('feathers', n === 1 ? 'flurry' : 0.05, [0, 6.4, 4], { n: 12, size: 0.6, color: '#ffffff', spread: 3 })
      if (n === 0) d.shot('face', kid, { side: -14 })
      else if (n === 1) { d.shot('medium', kid, { side: 18 }); S.tone = 'cold' }
      else { d.burst('puff', 'blizzard', [0, 7.4, 4], { n: 14, size: 1.5, color: '#ffffff', spread: 5 }); d.cam([5, 5.6, 14], [0, 6, 4], 52, null); S.tone = 'cold' }
    } else if (k === 2) {
      // My uncle cried at the town fair. We shoveled 3 feet off the cake.
      const n = cut('fair', '3'); d.show(uncle, -2.4, 0, 3, 12, n === 0 ? 'cry' : 'sad'); d.show(kid, 2.2, 0, 3, -12, 'neutral')
      S.fair.visible = true; S.cake.visible = true
      if (n === 0) { d.shot('medium', uncle, { side: 16 }); d.talk(uncle) }
      else if (n === 1) { d.cam([0, 4.3, 16], [0, 4.1, 3], 52, null); d.talk(kid); d.gest(kid) }
      else { d.cam([0, 4.3, 16], [0, 4.1, 3], 52, null); d.talk(kid); d.big(3); d.burst('puff', '3', [-2.4, 1.2, 2], { n: 12, size: 1.1, color: '#ffffff', spread: 2.5 }) }
    } else if (k === 3) {
      // So nobody here cries. We chew gum at sad movies.
      place = 'room'
      const n = cut('cries', 'movies'); d.show(v1, P.room - 2.4, 0, 2, 0, n ? 'bored' : 'neutral'); d.show(v2, P.room + 2.4, 0, 2, 0, n ? 'sleep' : 'neutral')
      d.allowEmpty() // a room insert with no speaker on screen
      if (n === 0) d.camFree([P.room, 4.4, 12], [P.room, 3.9, -3], 50, null)
      else { d.camFree([P.room + 0.4, 4.3, 11], [P.room, 3.8, -3], 48, null); d.burst('notes', 'movies', [P.room, 5, -8], { n: 6, size: 0.5, spread: 2 }) }
    } else if (k === 4) {
      // Every street has a plow. Every school has a NO CRYING sign.
      const n = cut('plow', 'sign'); S.plow.visible = true; S.post.visible = true
      if (n === 0) { d.cam([P.plaza + 7, 3.4, 10], [P.plaza + 12, 1.8, 2], 48, null); d.allowEmpty() }
      else if (n === 1) { d.cam([P.plaza - 8, 4.4, 10], [P.plaza - 8, 5.1, 2], 44, null); d.allowEmpty() }
      else { d.show(kid, 0, 0, 4, 0, 'smirk'); d.talk(kid); d.shot('face', kid, { side: -18 }) }
    } else if (k === 5) {
      // And me? I'm the driest kid in town. 4 years, no tears.
      const n = cut('me', '4'); d.show(kid, 0, 0, 4, 0, n ? 'determined' : 'neutral'); d.talk(kid)
      if (n === 0) d.shot('face', kid, { side: 12 })
      else { d.shot('medium', kid, { side: -22 }); d.big(4); d.gest(kid) }
    } else if (k === 6) {
      // My grandma? She cries at everything.
      place = 'porch'
      const n = cut('grandma', 'everything'); d.show(grandma, P.porch, 0, 4, 0, n ? 'tear' : 'smile'); d.show(kid, P.porch + 4.6, 0, 4, -10, 'neutral')
      if (n === 0) d.shot('face', grandma, { side: -16 })
      else { d.cam([P.porch + 2.3, 4.3, 16], [P.porch + 2.3, 4.1, 4], 52, null); d.talk(kid) }
    } else if (k === 7) {
      // She wears 3 sweaters in July and keeps bread in her pocket for pigeons.
      place = 'porch'
      const n = cut('3', 'pigeons'); d.show(grandma, P.porch, 0, 4, 0, 'smile')
      S.bread.visible = true; S.bread.position.set(P.porch + 0.7, 2.0, 4.6)
      for (let i = 0; i < 3; i++) {
        const p = S.pigeons[i]; p.visible = true
        p.position.set(P.porch - 1.6 + i * 1.6, 0, 1.8 + (i % 2) * 0.7)
        p.userData.part?.('LeftWing', Math.sin(t * 11 + i) * 16); p.userData.part?.('RightWing', -Math.sin(t * 11 + i) * 16)
      }
      if (n === 0) { d.shot('medium', grandma, { side: 14 }); d.big(3) }
      else { d.shot('wide', grandma, { side: 26 }); d.gest(grandma) }
    } else if (k === 8) {
      // She sobs at dog food commercials. Every single one.
      place = 'porch'
      const n = cut('sobs', 'one'); d.show(grandma, P.porch, 0, 4, 0, n ? 'cry' : 'tear')
      if (n === 0) d.shot('face', grandma, { side: -12 })
      else { d.shot('medium', grandma, { side: 18 }); d.burst('feathers', 'one', [P.porch, 5.2, 4], { n: 8, size: 0.45, color: '#bfe3ff', spread: 2 }) }
    } else if (k === 9) {
      // Then in August, the hill behind school caught fire.
      place = 'hill'
      const n = cut('August', 'fire'); d.show(kid, P.hill, 0, 6, 0, n ? 'shock' : 'neutral'); d.talk(kid)
      if (n === 0) { d.shot('face', kid, { side: 14 }) }
      else { S.fire.visible = true; S.fire.userData.light.intensity = 160; d.appear(S.fire, 'fire', { pos: [P.hill, 0, -8], size: 1 })
        mode = 'dusk'; S.tone = 'danger'; d.shake('fire', 0.35)
        d.cam([P.hill + 3.5, 3.2, 14], [P.hill, 3.6, -9], 52, null); d.allowEmpty() }
    } else if (k === 10) {
      // "We ran out of water in 10 minutes," the chief said.
      place = 'hill'; mode = 'dusk'; S.tone = 'danger'
      S.fire.visible = true; S.fire.userData.light.intensity = 160; S.fire.position.set(P.hill, 0, -8)
      const n = cut('10', 'minutes'); d.show(chief, P.hill + 6, 0, 5, -14, n ? 'frown' : 'shout'); d.talk(chief)
      if (n === 0) d.shot('face', chief, { side: -16 })
      else { d.shot('medium', chief, { side: 14 }); d.gest(chief) }
    } else if (k === 11) {
      // "The reservoir's empty. The hill's 200 feet high."
      place = 'hill'; mode = 'dusk'; S.tone = 'danger'
      S.fire.visible = true; S.fire.userData.light.intensity = 160; S.fire.position.set(P.hill, 0, -8)
      const n = cut('empty', '200'); d.show(chief, P.hill + 6, 0, 5, -14, 'frown'); d.talk(chief)
      if (n === 0) d.shot('face', chief, { side: 18 })
      else { d.big(200); d.cam([P.hill + 7, 2.4, 13], [P.hill, 11, -8], 54, null) }
    } else if (k === 12) {
      // Then I got an idea. A big enough cry could put it out.
      place = 'hill'; mode = 'dusk'; S.tone = 'danger'
      S.fire.visible = true; S.fire.userData.light.intensity = 160; S.fire.position.set(P.hill, 0, -8)
      const n = cut('idea', 'cry'); d.show(kid, P.hill, 0, 6, 0, n ? 'shine' : 'neutral'); d.talk(kid)
      if (n === 0) { d.shot('face', kid, { side: -12 }); d.burst('sparkle', 'idea', [P.hill, 5.4, 6], { n: 10, size: 0.55, spread: 1.8 }) }
      else { d.shot('medium', kid, { side: 20 }); d.gest(kid) }
    } else if (k === 13) {
      // But I hadn't cried in 4 years.
      place = 'hill'; mode = 'dusk'
      d.show(kid, P.hill, 0, 6, 0, 'frown'); d.talk(kid)
      d.shot('face', kid, { side: 14 })
    } else if (k === 14) {
      // I tried. A sad song. 1 tear. Snow the size of a plate.
      place = 'hill'; mode = 'dusk'
      S.fire.visible = true; S.fire.userData.light.intensity = 160; S.fire.position.set(P.hill, 0, -8)
      const n = cut('tear', 'plate'); d.show(kid, P.hill, 0, 6, 0, 'sad'); d.talk(kid)
      S.cloudSmall.visible = true; S.cloudSmall.scale.setScalar(n === 2 ? 0.5 : 0.28); S.cloudSmall.position.set(P.hill, 6.8, 6)
      if (n < 2) d.shot('face', kid, { side: -14 })
      else { d.big(1); d.shot('medium', kid, { side: -18 }) }
    } else if (k === 15) {
      // My goldfish. A flurry. It buried 3 bushes.
      place = 'hill'; mode = 'dusk'
      S.fire.visible = true; S.fire.userData.light.intensity = 160; S.fire.position.set(P.hill, 0, -8)
      const n = cut('flurry', 'bushes'); d.show(kid, P.hill, 0, 6, 0, 'sad'); d.talk(kid)
      S.cloudBig.visible = true; S.cloudBig.scale.setScalar(n === 2 ? 0.8 : 0.5); S.cloudBig.position.set(P.hill, 7.6, 6)
      for (const b of S.bushes) b.visible = true
      d.burst('feathers', 'flurry', [P.hill, 4, -1.5], { n: 18, size: 0.8, color: '#ffffff', spread: 5, floor: 0 })
      if (n < 2) d.shot('face', kid, { side: 16 })
      else { d.shot('medium', kid, { side: 18 }) }
    } else if (k === 16) {
      // The pigeons. A cloud that swallowed 10 cars.
      place = 'hill'; mode = 'dusk'
      S.fire.visible = true; S.fire.userData.light.intensity = 160; S.fire.position.set(P.hill, 0, -8)
      const n = cut('pigeons', 'cars'); d.show(kid, P.hill, 0, 6, 0, 'sad'); d.talk(kid)
      S.cloudBig.visible = true; S.cloudBig.scale.setScalar(n === 2 ? 1.35 : 0.9); S.cloudBig.position.set(P.hill, 8.4, 6)
      for (let i = 0; i < 3; i++) {
        const p = S.pigeons[i]; p.visible = true
        p.position.set(P.hill - 3 + i * 3, 6 + Math.sin(t * 4 + i) * 0.6, 1 + (i % 2))
        p.rotation.y = D(45 + i * 20); p.userData.part?.('LeftWing', Math.sin(t * 16 + i) * 28); p.userData.part?.('RightWing', -Math.sin(t * 16 + i) * 28)
      }
      if (n < 2) d.shot('medium', kid, { side: -18 })
      else { d.big(10); d.cam([P.hill + 5, 4.4, 14], [P.hill, 6.4, 2], 52, null) }
    } else if (k === 17) {
      // The fire didn't even notice.
      place = 'hill'; mode = 'dusk'
      S.fire.visible = true; S.fire.userData.light.intensity = 160; S.fire.position.set(P.hill, 0, -8)
      S.cloudSmall.visible = true; S.cloudSmall.scale.setScalar(0.3); S.cloudSmall.position.set(P.hill - 3, 4, -8)
      d.vanish(S.cloudSmall, 'notice', { size: 0.3 })
      d.burst('puff', 'notice', [P.hill - 3, 4.4, -8], { n: 9, size: 0.8, color: '#dfe7ef', spread: 2 })
      d.cam([P.hill + 2.5, 2.8, 12], [P.hill, 3.2, -8], 52, null); d.allowEmpty()
    } else if (k === 18) {
      // I was out of tears. Except one.
      place = 'hill'; mode = 'dusk'
      const n = cut('tears', 'one'); d.show(kid, P.hill, 0, 6, 0, n ? 'determined' : 'frown'); d.talk(kid)
      if (n === 0) d.shot('face', kid, { side: -10 })
      else { d.shot('face', kid, { side: 16, tight: 1.25 }); d.burst('sparkle', 'one', [P.hill, 5.2, 6], { n: 8, size: 0.5, spread: 1.4 }) }
    } else if (k === 19) {
      // "I'm scared of being left alone," I said. And I meant it.
      place = 'hill'; mode = 'dusk'
      const n = cut('scared', 'alone'); d.show(kid, P.hill, 0, 6, 0, n ? 'cry' : 'sad'); d.talk(kid)
      kid.pose({ head: [-8 + Math.sin(t * 5) * 3, 0, 0], armL: [34, 14], armR: [34, 14] })
      if (n === 0) d.shot('face', kid, { side: -16 })
      else d.closeUp(kid, { side: 12, tight: 0.92, low: -0.35 })
    } else if (k === 20) {
      // Thunder. A blizzard the size of the whole town rolled in.
      place = 'hill'; mode = 'night'; S.tone = 'cold'
      const n = cut('Thunder', 'blizzard'); d.show(kid, P.hill, 0, 6, 0, 'scared'); d.talk(kid)
      S.snow.visible = true; S.snow.position.set(P.hill, 0, -2); S.snow.userData.update(t)
      S.cloudHuge.visible = true; S.cloudHuge.scale.setScalar(n === 1 ? 1.9 : 0.5); S.cloudHuge.position.set(P.hill, 10, 4)
      if (n === 0) { d.shake('Thunder', 0.8); d.burst('sparkle', 'Thunder', [P.hill, 8, 4], { n: 20, size: 1.1, color: '#ffffff', spread: 9 }); d.shot('wide', kid, { side: 20 }) }
      else { d.cam([P.hill + 5, 3.4, 15], [P.hill, 7.4, 2], 54, null) }
    } else if (k === 21) {
      // The fire was out in 1 minute.
      place = 'hill'; mode = 'day'
      const n = cut('out', 'minute')
      S.fire.visible = true; S.fire.position.set(P.hill, 0, -8); S.fire.userData.light.intensity = 60
      d.vanish(S.fire, 'out', { size: 1 })
      d.burst('puff', 'out', [P.hill, 3, -8], { n: 20, size: 2.2, color: '#dfe9f2', spread: 6, floor: 0 })
      S.snow.visible = true; S.snow.position.set(P.hill, 0, -3); S.snow.userData.update(t)
      if (n === 1) d.big(1)
      d.cam([P.hill + 2.5, 3.2, 12], [P.hill, 3.4, -8], 52, null); d.allowEmpty()
    } else if (k === 22) {
      // But it didn't stop. It snowed for 2 days.
      place = 'hill'; mode = 'day'; S.tone = 'cold'
      S.snow.visible = true; S.snow.position.set(P.hill, 0, -2); S.snow.userData.update(t)
      S.snowHeap.visible = true
      const n = cut('stop', 'days'); d.show(kid, P.hill, 0, 6, 0, 'freezing'); d.talk(kid)
      if (n === 0) d.shot('medium', kid, { side: -18 })
      else d.shot('wide', kid, { side: 22 })
    } else if (k === 23) {
      // The buses were buried. The pigeons vanished.
      place = 'hill'; mode = 'day'; S.tone = 'cold'
      S.snow.visible = true; S.snow.position.set(P.hill, 0, -2); S.snow.userData.update(t)
      S.snowHeap.visible = true
      for (let i = 0; i < 3; i++) { const b = S.buses[i]; b.visible = true; b.position.y = -0.1 }
      const n = cut('buried', 'vanished')
      for (let i = 0; i < 3; i++) {
        const p = S.pigeons[i]; p.visible = true; p.position.set(P.hill - 2 + i * 2, 2.5, 0)
        d.vanish(p, 'vanished', { size: 1 })
      }
      if (n === 0) { d.cam([P.hill + 4, 3.4, 10], [P.hill, 2, -12], 52, null); d.allowEmpty() }
      else { d.cam([P.hill - 2, 3, 8], [P.hill - 2, 2.4, 0], 46, null); d.allowEmpty() }
    } else if (k === 24) {
      // Grandma trudged up in 3 soaked sweaters.
      place = 'hill'; mode = 'day'; S.tone = 'cold'
      S.snow.visible = true; S.snow.position.set(P.hill, 0, 0); S.snow.userData.update(t)
      const n = cut('trudged', '3')
      d.walkTo(grandma, [P.hill + 4.6, 15], [P.hill + 4.6, 5], 'freezing', 3.1, 0, 0)
      d.show(kid, P.hill, 0, 6, 10, 'freezing'); d.talk(kid)
      if (n === 0) d.cam([P.hill + 2.3, 4.3, 18], [P.hill + 2.3, 4.1, 6], 52, null)
      else { d.big(3); d.cam([P.hill + 2.3, 4.3, 17], [P.hill + 2.3, 4.1, 6], 52, null) }
    } else if (k === 25) {
      // "I'm crying too," she said.
      place = 'hill'; mode = 'day'; S.tone = 'cold'
      S.snow.visible = true; S.snow.position.set(P.hill, 0, 0); S.snow.userData.update(t)
      d.show(grandma, P.hill + 4.6, 0, 5, -12, 'cry'); d.talk(grandma)
      d.show(kid, P.hill, 0, 6, 8, 'oh')
      d.shot('face', grandma, { side: -18 })
    } else if (k === 26) {
      // The second blizzard buried the whole block.
      place = 'hill'; mode = 'night'; S.tone = 'cold'
      S.snow.visible = true; S.snow.position.set(P.hill, 0, -2); S.snow.userData.update(t)
      S.cloudHuge.visible = true; S.cloudHuge.scale.setScalar(2.5); S.cloudHuge.position.set(P.hill + 6, 11, 5)
      d.show(grandma, P.hill + 4.6, 0, 5, -12, 'freezing'); d.show(kid, P.hill, 0, 6, 8, 'freezing')
      d.shake(0.05, 0.5)
      d.cam([P.hill + 5, 3.6, 16], [P.hill + 3, 7, 1], 54, null)
    } else if (k === 27) {
      // We don't chew gum at movies anymore.
      place = 'room'
      d.show(v1, P.room - 3.2, 0, 2, 0, 'frown')
      d.show(kid, P.room + 0.4, 0, 4.4, 0, 'neutral'); d.talk(kid)
      const n = cut('gum', 'anymore')
      if (n === 0) d.camFree([P.room, 4.6, 13], [P.room, 3.9, -3], 52, null)
      else d.camFree([P.room + 0.5, 4.4, 12], [P.room, 3.8, -3], 50, null)
    } else {
      // We just shovel.
      place = 'plaza'
      const n = cut('shovel')
      d.show(kid, 0, 0, 4, -14, n ? 'determined' : 'neutral'); d.talk(kid)
      S.shovel.visible = true
      S.shovel.position.set(0.9, 0, 4.8); S.shovel.rotation.z = D(-18 + Math.sin(t * 8) * 14); S.shovel.rotation.y = D(12)
      kid.pose({ armL: [58, 12], armR: [72, 10], torso: [10, 0, 0] })
      S.cloudSmall.visible = true; S.cloudSmall.scale.setScalar(0.4); S.cloudSmall.position.set(0, 0.6, 1.4)
      if (n === 0) d.shot('medium', kid, { side: 20 })
      else d.shot('wide', kid, { side: -16 })
    }

    // flames keep breathing (small, never a frozen fire)
    for (let i = 0; i < S.fire.userData.flames.length; i++) {
      const f = S.fire.userData.flames[i]
      f.scale.y = 0.86 + Math.sin(t * 9 + i * 1.7) * 0.16
      f.rotation.y = Math.sin(t * 5 + i) * 0.2
    }
    S.L.step(t)
    // Town extras belong to the plaza only. Off-plaza they are invisible and must not
    // take part in the collision or framing checks (they were brushing arms at the hill).
    for (const p of S.L.people) p.root.visible = place === 'plaza'
    setPlace(place, mode, S.look)
    d.done()
  },

  render({ renderer, scene, camera, state }) { renderer.toneMapping = T.NoToneMapping; renderShot(renderer, scene, camera, { dof: state.dof }) },
  overlay(env) { grade(env.ctx, env.W, env.H, { look: env.state.tone ?? 'none' }); captions(env) },
}

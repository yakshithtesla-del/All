// Snow-ridge rescue short. Each beat has a physical action; camera framing and geography stay continuous.
import { setThree, T, D, cl, Classic, world, grade, loadMouth, renderShot, loadFonts, box, direct, captions, texturize, life, snowfall, mat } from '../lib/blocky/index.js'

const ridge = { x: 13, z: -14, y: 8 }
const STAGE_X = 600
const heroAt = [-3, 0, 5]
const chiefAt = [-8, 0, 1]

function shield(size, color = '#65c8f2') {
  const g = new T.Group()
  const shape = new T.Shape()
  shape.moveTo(-1.8, 0); shape.lineTo(-2.1, 2.8); shape.quadraticCurveTo(-2.15, 4.5, 0, 5.4); shape.quadraticCurveTo(2.15, 4.5, 2.1, 2.8); shape.lineTo(1.8, 0); shape.quadraticCurveTo(0, -0.65, -1.8, 0)
  const body = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.12, bevelThickness: 0.1 }), new T.MeshStandardMaterial({ color, metalness: 0.28, roughness: 0.32, emissive: color, emissiveIntensity: 0.08 }))
  body.position.z = -0.18; body.castShadow = body.receiveShadow = true; g.add(body)
  const rim = new T.LineSegments(new T.EdgesGeometry(body.geometry), new T.LineBasicMaterial({ color: '#e7fbff', transparent: true, opacity: 0.9 })); rim.position.copy(body.position); g.add(rim)
  const boss = new T.Mesh(new T.CylinderGeometry(0.42, 0.52, 0.2, 6), new T.MeshStandardMaterial({ color: '#f6d46a', metalness: 0.45, roughness: 0.3 }))
  boss.rotation.x = Math.PI / 2; boss.position.set(0, 2.55, 0.22); g.add(boss)
  g.scale.setScalar(size); g.userData.carried = true
  return g
}

function cloud(parent, x, y, z, scale = 1) {
  const g = new T.Group(); const m = new T.MeshStandardMaterial({ color: '#f8fbff', roughness: 0.95 })
  for (const [a, b, c, r] of [[0, 0, 0, 1.4], [1.1, 0.2, 0, 1.15], [-1, 0.25, 0, 1.05], [0.15, 0.9, 0, 1.0]]) { const p = new T.Mesh(new T.SphereGeometry(r, 12, 10), m); p.position.set(a, b, c); p.castShadow = true; g.add(p) }
  g.position.set(x, y, z); g.scale.setScalar(scale); parent.add(g); return g
}

function lookout(scene) {
  const g = new T.Group()
  box(g, 14, 1, 12, '#6b7786', 0, 0.2, 0, 'snow')
  box(g, 12, 0.4, 0.6, '#8a5a2c', 0, 1.0, 5.1, 'planks')
  box(g, 0.45, 3.6, 0.45, '#8a5a2c', -5.4, 2.6, 5.1, 'planks'); box(g, 0.45, 3.6, 0.45, '#8a5a2c', 5.4, 2.6, 5.1, 'planks')
  for (const y of [1.5, 2.6, 3.6]) box(g, 11, 0.18, 0.18, '#b78755', 0, y, 5.1, 'planks')
  for (const x of [-5, -2.5, 0, 2.5, 5]) box(g, 0.16, 3.3, 0.16, '#b78755', x, 2.5, 5.1, 'planks')
  // A clearly visible short stair run on the safe side of the platform.
  for (let i = 0; i < 8; i++) box(g, 5, 0.35, 1.2, i % 2 ? '#718090' : '#8793a0', 0, 0.3 + i * 0.48, 4 - i * 1.35, 'snow')
  g.position.set(ridge.x, ridge.y, ridge.z); scene.add(g); texturize(g); return g
}

function bridge(scene) {
  const g = new T.Group()
  // Short, closed bridge links the lookout ridge to the rescue staging ledge.
  box(g, 14, 0.7, 4.4, '#8a5a2c', 0, 0.1, 0, 'planks')
  for (const z of [-2, 2]) { box(g, 14, 0.18, 0.18, '#b78755', 0, 1.6, z, 'planks'); for (let x = -6; x <= 6; x += 3) box(g, 0.18, 1.8, 0.18, '#b78755', x, 0.8, z, 'planks') }
  g.position.set(1.2, 0, -13); scene.add(g); texturize(g); return g
}

function makeRope() {
  const g = new T.Group(), line = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 18, 8), mat('#d6c39c'))
  line.rotation.z = Math.PI / 2; line.position.y = 0.2; line.castShadow = true; g.add(line); g.userData.carried = true; return g
}

export default {
  async create({ THREE, scene }) {
    setThree(THREE); await loadFonts()
    const w = world({ kind: 'meadow', theme: 'snow', seed: 6319 }); scene.add(w.root)
    scene.fog = w.fog
    // Stage on an isolated snow shelf. This keeps the scripted ridge geography clear of the meadow's random rocks/trees.
    const set = new T.Group(); set.position.x = STAGE_X; scene.add(set)
    scene.background = new T.Color('#a9cbe0')
    const ground = new T.Mesh(new T.PlaneGeometry(220, 220), mat('#e9f0f7', 0.98)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.55; ground.receiveShadow = true; ground.userData.tex = 'snow'; set.add(ground)
    for (const [x, y, z, sx, sy, sz] of [[-58, 4, -62, 36, 24, 22], [-5, 4, -78, 40, 30, 22], [56, 2, -58, 38, 22, 28], [48, 1, 32, 42, 20, 25], [-54, 2, 36, 38, 20, 24]]) {
      const m = new T.Mesh(new T.SphereGeometry(1, 22, 16), mat('#d7e4f1', 0.96)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.receiveShadow = true; set.add(m)
    }
    const lookoutSet = lookout(set), crossing = bridge(set)
    const platform = box(set, 17, 2.4, 15, '#74818f', 13, 6.6, -14, 'snow'); platform.castShadow = true; platform.receiveShadow = true
    const ridgeSnow = box(set, 21, 1.2, 15, '#eef3fa', 13, 7.6, -14, 'snow'); ridgeSnow.receiveShadow = true
    const lower = box(set, 24, 1.5, 18, '#8793a0', -10, -0.2, -18, 'snow'); lower.receiveShadow = true
    const flurry = snowfall(380, 58); set.add(flurry)
    const clouds = [cloud(set, -18, 24, -30, 2.5), cloud(set, 20, 27, -40, 3.1), cloud(set, 0, 22, 18, 2.2)]
    const hero = Classic({ name: 'narrator', skin: '#d69e78', top: { kind: 'jacket', color: '#e04b42', inner: '#fff0df' }, pants: { kind: 'jeans', color: '#253b63' }, hair: { style: 'messy', color: '#33221f' }, scale: 0.9, seed: 42 }); scene.add(hero.root); hero.wear('beanie', '#263f72')
    const lio = Classic({ name: 'Lio', skin: '#f0c49a', top: { kind: 'jacket', color: '#2f92a6', inner: '#e8f6f8' }, pants: { kind: 'jeans', color: '#394457' }, hair: { style: 'curly', color: '#40271c' }, scale: 0.86, seed: 23 }); scene.add(lio.root); lio.wear('scarf', '#f2c230')
    const chief = Classic({ name: 'chief', skin: '#bd8665', top: { kind: 'jacket', color: '#4c668b', inner: '#ecf1f5' }, pants: { kind: 'plain', color: '#333d4d' }, hair: { style: 'short', color: '#46342b' }, scale: 1.03, seed: 9 }); scene.add(chief.root); chief.wear('hardhat', '#f2c230')
    const coach = Classic({ name: 'coach', skin: '#b97858', top: { kind: 'uniform', color: '#8a4f9e', inner: '#f7e9ff' }, pants: { kind: 'plain', color: '#36435e' }, hair: { style: 'bald', color: '#4a352a' }, scale: 1.02, seed: 77 }); scene.add(coach.root); coach.wear('badge', '#f2c230')
    const rescuer = Classic({ name: 'rescuer', skin: '#e0b184', top: { kind: 'jacket', color: '#e5963f', inner: '#fff0df' }, pants: { kind: 'plain', color: '#35445a' }, hair: { style: 'none' }, scale: 0.98, seed: 81 }); scene.add(rescuer.root); rescuer.wear('hardhat', '#e5963f')
    const extras = [-14, -8, 2, 8].map((x, i) => { const c = Classic({ name: `townsperson${i + 1}`, skin: ['#e5b998', '#b57f61', '#efd1ad', '#c18c6f'][i], top: { kind: 'tee', color: ['#687db0', '#a7575e', '#4b907e', '#be8b43'][i] }, pants: { kind: 'plain', color: '#3d4659' }, hair: { style: ['swept', 'short', 'messy', 'bun'][i], color: '#332a27' }, scale: 0.9, seed: 90 + i }); scene.add(c.root); return c })
    const shieldSmall = shield(0.22), shieldMedium = shield(0.72), shieldGiant = shield(2.9, '#54bfe9'), shieldSecond = shield(2.25, '#f2c85f')
    for (const s of [shieldSmall, shieldMedium, shieldGiant, shieldSecond]) { s.visible = false; set.add(s) }
    const rope = makeRope(); rope.visible = false; set.add(rope)
    const game = box(set, 2.2, 0.35, 1.4, '#f3ac32', -23, 0.4, 4, 'planks'); game.visible = false
    // One persistent place, snow light and a stable ridge-to-bridge eyeline across all beats.
    const mood = w.mood
    return { mouth: await loadMouth(), w, set, lookoutSet, crossing, platform, ridgeSnow, lower, flurry, clouds, hero, lio, chief, coach, rescuer, extras, shieldSmall, shieldMedium, shieldGiant, shieldSecond, rope, game, scene, mood, tone: 'none' }
  },

  update(env) {
    const { state: S, index: k, raw, dur, globalT: t } = env
    const d = direct(env, [S.hero, S.lio, S.chief, S.coach, S.rescuer])
    const q = cl(raw / Math.max(0.1, dur)), pulse = Math.sin(t * 12)
    S.flurry.userData.update(t)
    for (let i = 0; i < S.clouds.length; i++) { S.clouds[i].position.x += Math.sin(t * 0.22 + i) * 0.006; S.clouds[i].position.y += Math.sin(t * 0.45 + i * 2) * 0.025 }
    for (const s of [S.shieldSmall, S.shieldMedium, S.shieldGiant, S.shieldSecond]) s.visible = false
    S.rope.visible = false; S.game.visible = false
    const showAt = (c, x, y, z, ry = 0, face = 'neutral') => d.show(c, STAGE_X + x, y, z, ry, face)
    const placeHero = (x = heroAt[0], z = heroAt[2], face = 'neutral', ry = 0) => { showAt(S.hero, x, 0, z, ry, face); S.hero.root.rotation.z = Math.sin(t * 2.2) * 0.025 }
    const placeLio = (face = 'smile') => { showAt(S.lio, ridge.x + 3, ridge.y + 1, ridge.z + 2.5, -90, face); S.lio.standOn = ridge.y + 1; S.lio.touching = true }
    const placeChief = (x = chiefAt[0], z = chiefAt[2], face = 'worried') => showAt(S.chief, x, 0, z, 10, face)
    const actionPose = (c, n = 0) => c.pose({ armL: [32 + 20 * Math.sin(t * 5 + n), 12], armR: [50 + 22 * Math.sin(t * 4 + n), 16], head: [Math.sin(t * 2.5 + n) * 3, Math.sin(t * 1.7 + n) * 7, 0] })
    const camera = (p, look, lens = 54) => d.cam([p[0] + STAGE_X, p[1], p[2]], [look[0] + STAGE_X, look[1], look[2]], lens, null)
    const speak = (c) => { d.talk(c); d.gest(c) }
    // baseline shows the continuous snowy rescue setting, not an unrelated cutaway.
    camera([-5, 9, 31], [2, 5, -5], 54)

    if (k === 0) {
      placeHero(-3, 5, q > .55 ? 'oh' : 'neutral'); speak(S.hero)
      S.shieldSmall.visible = q > .48; S.shieldSmall.position.set(-1, 0.2, 7); S.shieldSmall.rotation.y = Math.PI
      if (q > .45) { S.hero.pose({ armR: [105 + pulse * 6, -10], armL: [20, 4] }); camera([-7, 7, 25], [-1, 3.3, 7], 50) }
      else camera([-10, 8, 31], [1, 4, -3], 54)
    } else if (k === 1) {
      placeHero(-3, 5, q > .5 ? 'proud' : 'curious'); speak(S.hero)
      const scale = q < .5 ? 0.22 : 1.08
      S.shieldSmall.visible = true; S.shieldSmall.scale.setScalar(scale); S.shieldSmall.position.set(-1, 0.2, 7)
      S.shieldMedium.visible = q >= .48; S.shieldMedium.scale.setScalar(0.72 + q * 0.1); S.shieldMedium.position.set(4, 0, 5)
      S.hero.pose({ armL: [48, 12], armR: [q < .5 ? 80 : 132, 16], head: [-4, 0, 0] })
      camera([-12, 9, 29], [1.2, 4.5, 5], 54)
    } else if (k === 2 || k === 3) {
      showAt(S.coach, -13, 0, 4, 0, k === 2 ? (q > .6 ? 'scared' : 'worried') : 'oh')
      showAt(S.hero, -18, 0, 4, 0, 'curious')
      if (k === 2) { speak(S.coach); S.coach.pose({ armR: [80 + pulse * 8, 18], armL: [22, 0] }); camera([-22, 7, 25], [-15, 3.6, 4], 52) }
      else {
        S.game.visible = true; S.game.position.set(-23, 0.3 + Math.max(0, Math.sin(t * 7)) * 0.2, 4)
        S.shieldSmall.visible = true; S.shieldSmall.scale.setScalar(0.22); S.shieldSmall.position.set(-9.2, 0.1, 4.6)
        const u = cl((raw - dur * .42) / (dur * .24)); S.shieldSmall.position.x = -9.2 + 5.3 * u
        S.coach.pose({ armL: [90, 28], armR: [90, -28], torso: [0, 0, -8] }); S.hero.setFace('shock'); actionPose(S.hero, 3)
        camera([-22, 8, 23], [-15, 3, 4], 54)
      }
    } else if (k === 4) {
      placeHero(-4, 6, 'smirk'); speak(S.hero)
      for (let i = 0; i < 4; i++) {
        const extra = S.extras[i]; showAt(extra, [-14, -8, 2, 8][i], 0, 10 + (i % 2) * 3, i % 2 ? 180 : 0, 'worried')
        extra.pose({ armL: [38, 14], armR: [22, 6], head: [0, Math.sin(t * 2 + i) * 10, 0] })
      }
      S.hero.pose({ armL: [82, 22], armR: [82, -22], head: [0, 8, 0] }); camera([-7, 10, 36], [-4, 4.5, 10], 56)
    } else if (k === 5) {
      placeHero(-3, 7, 'proud', 0); speak(S.hero)
      S.hero.pose({ armL: [18, 0], armR: [122 + pulse * 4, 15], head: [-6, -4, 0] })
      camera([-10, 6, 28], [-3, 4, 8], 49)
    } else if (k === 6) {
      placeHero(-5, 6, 'smile'); S.hero.pose({ armL: [15, 0], armR: [20, 0] })
      showAt(S.lio, -10, 0, 8, 20, q > .55 ? 'happy' : 'neutral'); speak(S.lio)
      S.lio.pose({ armL: [32, 12], armR: [88 + pulse * 6, 16], head: [-6, 0, 0] })
      // Counts clouds with a mittened finger; cocoa thermos visible beside him.
      S.game.visible = true; S.game.scale.setScalar(.55); S.game.position.set(-9.5, 1.3 + Math.sin(t * 2) * .12, 8)
      camera([-18, 8, 27], [-8, 4, 7], 52)
    } else if (k === 7) {
      placeHero(-7, 7, 'smile'); showAt(S.lio, -12, 0, 8, 0, 'proud'); speak(S.lio)
      S.lio.pose({ armL: [65, 20], armR: [55, 18], head: [-3, 0, 0] }); S.hero.pose({ armR: [35, 18], head: [0, -18, 0] })
      camera([-17, 7, 26], [-9, 4, 7], 48)
    } else if (k === 8) {
      placeHero(-5, 6, 'happy'); showAt(S.lio, -10, 0, 8, 0, 'happy'); speak(S.hero)
      S.hero.pose({ armR: [58, 18], armL: [28, 10] }); S.lio.pose({ armL: [22, 0], armR: [18, 0], head: [0, -10, 0] })
      camera([-16, 8, 29], [-8, 4, 8], 50)
    } else if (k === 9) {
      placeHero(-3, 6, 'worried'); placeLio('scared'); speak(S.hero)
      const wind = Math.sin(t * 9); S.lio.root.position.x = STAGE_X + ridge.x + 3 + wind * .18; S.lio.pose({ armL: [75 + wind * 20, 24], armR: [92 - wind * 17, 22], torso: [4, 0, wind * 3] })
      S.scene.fog.near = 16; S.scene.fog.far = 95
      camera([-8, 18, 37], [5, 8, -11], 56)
    } else if (k === 10) {
      placeHero(-4, 7, 'worried'); placeLio('worried'); placeChief(-8, 1, 'determined'); speak(S.hero)
      const sway = Math.sin(t * 17) * 0.5
      S.rope.visible = true; S.rope.position.set(sway, 3, -10); S.rope.rotation.z = sway * .07
      S.chief.pose({ armL: [75, 20], armR: [115 + sway * 8, 24], torso: [0, 0, sway * 4] })
      camera([-11, 12, 31], [2, 6, -11], 56)
    } else if (k === 11) {
      showAt(S.chief, -8, 0, 1, 0, 'determined'); speak(S.chief)
      S.chief.pose({ armR: [112, 20], armL: [30, 12], head: [-4, 0, 0] })
      S.rope.visible = true; S.rope.position.set(-1, 2.6, -11)
      camera([-15, 7, 23], [-8, 3.5, 1], 48)
      if (q > .35) d.big(40)
    } else if (k === 12 || k === 13 || k === 14 || k === 15) {
      placeHero(-3, 6, k === 12 ? 'worried' : 'scared'); speak(S.hero)
      S.hero.pose({ armR: [k === 12 ? 22 : 104 + pulse * 8, 16], armL: [25, 6], head: [0, 8, 0] })
      const scale = k === 12 ? .18 : k === 13 ? .22 : k === 14 ? .42 : .72
      S.shieldSmall.visible = k === 12 || k === 13 || k === 14; S.shieldSmall.scale.setScalar(scale); S.shieldSmall.position.set(-1.2, .3, 7)
      if (k === 12) camera([-8, 7, 24], [-3, 4, 7], 44)
      if (k === 13) { S.shieldSmall.position.x = -1 + q * .6; camera([-9, 8, 25], [-2, 3.5, 7], 50) }
      if (k === 14) {
        const snowflake = new T.Vector3(-5 + q * 7, 6 + q * 2, 11); S.shieldSmall.position.set(-1, .4, 7)
        S.hero.pose({ armL: [52, 18], armR: [74, 20] }); camera([-12, 7, 23], [-2, 3, 7], 49)
      }
      if (k === 15) {
        S.shieldMedium.visible = true; S.shieldMedium.position.set(-.2, .3, 7); S.shieldMedium.scale.setScalar(.38 + q * .34)
        S.hero.pose({ armL: [92, 23], armR: [112, 24], torso: [0, 0, -6] }); camera([-12, 9, 25], [-1, 4, 7], 51)
      }
    } else if (k === 16) {
      placeHero(-4, 6, 'determined'); showAt(S.rescuer, -9, 0, -3, 0, 'worried'); speak(S.hero)
      S.shieldMedium.visible = true; S.shieldMedium.position.set(-8.5, .1, -1); S.shieldMedium.scale.setScalar(.8)
      S.rescuer.pose({ armL: [48, 15], armR: [112, 23], head: [0, -10, 0] }); S.rope.visible = true; S.rope.position.set(1 + Math.sin(t * 16) * .4, 3, -10)
      camera([-15, 10, 27], [-3, 4, -2], 53)
    } else if (k === 17) {
      placeHero(-3, 7, 'shock'); placeLio('worried'); speak(S.hero)
      S.hero.root.rotation.y = D(-24 + Math.sin(t * 2) * 4); S.hero.pose({ armL: [12, 0], armR: [16, 0], head: [0, 18, 0] })
      S.lio.pose({ armL: [30, 8], armR: [35, 6], head: [0, -8, 0] })
      camera([-13, 12, 33], [2, 7, -10], 55)
    } else if (k === 18) {
      placeHero(-3, 7, 'tear'); placeLio('happy'); speak(S.hero)
      S.hero.pose({ armL: [22, 8], armR: [110 + pulse * 4, 18], head: [-8, -12, 4] }); S.lio.pose({ armL: [30, 8], armR: [30, 8], head: [0, -8, 0] })
      camera([-12, 8, 28], [0, 7, -9], 48)
    } else if (k === 19) {
      placeHero(-4, 7, 'determined'); placeLio('happy'); showAt(S.chief, -8, 0, 1, 0, 'determined'); showAt(S.rescuer, -4, 0, -4, 0, 'determined')
      S.shieldGiant.visible = true
      const appear = cl((q - .05) / .45), full = 2.9 * appear
      S.shieldGiant.scale.setScalar(Math.max(.001, full)); S.shieldGiant.position.set(1, 0, 1.8); S.shieldGiant.rotation.y = Math.PI
      const gust = Math.sin(t * 18) * (1 - appear) * .75
      S.clouds[2].position.x = 4 - q * 12; S.rope.visible = true; S.rope.position.set(1 + gust, 2.3, -10)
      S.hero.pose({ armL: [90, 20], armR: [105, 22], torso: [0, 0, -5] }); S.chief.pose({ armL: [55, 20], armR: [115, 28] })
      camera([-18, 16, 36], [1, 7, -6], 56)
    } else if (k === 20) {
      placeHero(-3, 7, 'happy'); placeLio('happy'); showAt(S.chief, -14, 0, 4, 0, 'smile'); showAt(S.rescuer, -4, 0, -4, 0, 'happy')
      S.shieldGiant.visible = true; S.shieldGiant.scale.setScalar(2.9); S.shieldGiant.position.set(1, 0, 1.8); S.shieldGiant.rotation.y = Math.PI
      const walk = cl(q * 1.4); S.rescuer.root.position.x = STAGE_X - 4 + walk * 14; S.rescuer.root.position.z = -4 - walk * 7; S.rescuer.touching = true
      S.chief.pose({ armL: [54, 20], armR: [78, 18] }); S.rescuer.pose({ armL: [74, 20], armR: [82, 16] })
      camera([-19, 17, 39], [2, 7, -8], 56)
    } else if (k === 21) {
      placeHero(-3, 7, 'oh'); placeLio('laugh'); speak(S.hero)
      S.shieldGiant.visible = true; S.shieldGiant.scale.setScalar(2.9); S.shieldGiant.position.set(16, 0, 1.8)
      const slide = cl((q - .15) / .7); S.shieldGiant.position.x = 16 - slide * 5; S.shieldGiant.position.z = 1.8 + slide * 10; S.shieldGiant.rotation.z = slide * .08
      S.hero.pose({ armL: [96, 30], armR: [96, -30], head: [0, 16, 0] }); S.lio.pose({ armL: [80, 25], armR: [80, -25], torso: [-6, 0, 0] })
      camera([-8, 15, 37], [6, 7, 2], 56)
    } else if (k === 22) {
      placeHero(-4, 7, 'happy'); placeLio('worried'); speak(S.lio)
      S.lio.pose({ armL: [112, 22], armR: [96, 20], head: [0, -15, 0] })
      S.shieldGiant.visible = true; S.shieldGiant.scale.setScalar(2.9); S.shieldGiant.position.set(-7, 0, 12)
      S.shieldSecond.visible = true; const s = cl((q - .18) / .4); S.shieldSecond.scale.setScalar(Math.max(.01, s * 2.25)); S.shieldSecond.position.set(3, 0, -1); S.shieldSecond.rotation.y = Math.PI
      camera([-15, 12, 32], [-3, 5, 5], 55)
    } else {
      placeHero(-8, 6, 'smile'); speak(S.hero)
      showAt(S.chief, -13, 0, 4, 0, 'determined'); actionPose(S.hero)
      S.shieldSmall.visible = true; S.shieldSmall.scale.setScalar(.2); S.shieldSmall.position.set(-9, 3.8, 4)
      camera([-17, 8, 27], [-9, 4, 6], 50)
    }

    for (const c of S.extras) { c.root.visible = k === 4; c.idle(t) }
    S.w.mood('day')
    d.done()
  },

  render({ renderer, scene, camera, state }) { renderer.toneMapping = T.NoToneMapping; renderShot(renderer, scene, camera, { dof: state.dof }) },
  overlay(env) { grade(env.ctx, env.W, env.H, { look: env.state.tone ?? 'none' }); captions(env) },
}

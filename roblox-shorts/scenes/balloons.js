// "In This Town, Every Laugh Blows a BALLOON": the first 35 s (to the cliffhanger "She's at 200.").
// One shot per line. Sets sit far apart in one world; each shot picks who is visible and where the camera is.
import { setThree, T, D, cl, Classic, city, loadMouth, renderShot, loadFonts, mat, box, sign, direct, captions, world, texturize } from '../lib/blocky/index.js'

function balloon(color) { const g = new T.Group(); const b = new T.Mesh(new T.SphereGeometry(1, 28, 20), new T.MeshStandardMaterial({ color, roughness: 0.25 })); b.scale.y = 1.15; b.castShadow = true; g.add(b); const k = new T.Mesh(new T.ConeGeometry(0.14, 0.2, 10), mat(color)); k.position.y = -1.2; g.add(k); return g }
function pigeon() { const g = new T.Group(); box(g, 0.5, 0.42, 0.8, '#8d93a3', 0, 0.4, 0); box(g, 0.3, 0.3, 0.3, '#6f7586', 0, 0.74, 0.34); box(g, 0.1, 0.08, 0.2, '#f2a33a', 0, 0.72, 0.56); for (const s of [-1, 1]) box(g, 0.08, 0.2, 0.08, '#f2a33a', s * 0.12, 0.1, 0); const wl = box(g, 0.7, 0.06, 0.5, '#7b8192', -0.55, 0.52, 0), wr = box(g, 0.7, 0.06, 0.5, '#7b8192', 0.55, 0.52, 0); g.userData.flap = (t) => { wl.rotation.z = Math.sin(t * 22) * 0.7; wr.rotation.z = -Math.sin(t * 22) * 0.7 }; return g }
function hat() { const g = new T.Group(); const br = new T.Mesh(new T.CylinderGeometry(0.95, 0.95, 0.08, 24), mat('#2b2b30')); g.add(br); const top = new T.Mesh(new T.CylinderGeometry(0.58, 0.62, 0.6, 24), mat('#2b2b30')); top.position.y = 0.32; g.add(top); return g }

export default {
  async create({ THREE, scene }) {
    setThree(THREE)
    await loadFonts()
    const w = world({ kind: 'city', theme: 'sunny', seed: 12 }); scene.add(w.root); scene.fog = w.fog
    w.clear(200, 0, 50); w.clear(-200, 0, 50); w.clear(10.5, -150, 25) // the classroom, the cinema and the clock tower get their spots
    const S = { mouth: await loadMouth(), mood: w.mood }
    // classroom at x = 200
    const cr = new T.Group(); cr.position.set(200, 0, 0); scene.add(cr)
    box(cr, 30, 0.2, 24, '#b9b3ad', 0, 0.1, 0); box(cr, 30, 14, 0.4, '#d7cdc0', 0, 7, -12); for (const s of [-1, 1]) box(cr, 0.4, 14, 24, '#cfc5b8', s * 15, 7, 0); box(cr, 30, 0.4, 24, '#ece7df', 0, 14.2, 0)
    box(cr, 12, 5, 0.2, '#2f5d46', 0, 7.5, -11.7); const bd = sign('2 + 2 = ?', 10, 4, '#2f5d46', '#e9f2ea', 150); bd.position.set(0, 7.5, -11.55); cr.add(bd)
    for (const [x, z] of [[-5, -2], [5, -2], [-5, 4], [5, 4]]) { box(cr, 4.4, 0.25, 2.4, '#7a4a22', x, 2.6, z); for (const sx of [-1.9, 1.9]) box(cr, 0.2, 2.5, 2, '#5d381a', x + sx, 1.25, z) }
    for (const z of [-6, 2]) { box(cr, 0.1, 5, 6, '#bfe3ff', -14.7, 8, z); box(cr, 0.14, 0.3, 6.4, '#f4f1e8', -14.66, 8, z); box(cr, 0.14, 5.4, 0.3, '#f4f1e8', -14.66, 8, z) }
    box(cr, 6, 0.3, 2.6, '#8a5a2c', -8, 2.9, -8); box(cr, 0.3, 2.8, 2.4, '#6b4320', -10.8, 1.4, -8); box(cr, 0.3, 2.8, 2.4, '#6b4320', -5.2, 1.4, -8)
    const po = sign('NO\nLAUGHING', 3.4, 4.2, '#d8433b', '#fff', 150); po.position.set(9.5, 8, -11.55); cr.add(po); const ck = new T.Mesh(new T.CircleGeometry(1, 30), new T.MeshBasicMaterial({ color: '#fbf8ee' })); ck.position.set(-9.5, 10.5, -11.55); cr.add(ck)
    S.net = new T.Group(); cr.add(S.net); for (let i = -7; i <= 7; i++) { box(S.net, 0.08, 0.08, 22, '#f4f4f0', i * 2, 11.6, 0); box(S.net, 28, 0.08, 0.08, '#f4f4f0', 0, 11.6, i * 1.5) }
    // cinema at x = -200
    const ci = new T.Group(); ci.position.set(-200, 0, 0); scene.add(ci)
    box(ci, 30, 0.2, 30, '#2a2030', 0, 0.1, 0); box(ci, 30, 16, 0.4, '#1c1622', 0, 8, -12); for (const s of [-1, 1]) box(ci, 0.4, 16, 30, '#1c1622', s * 15, 8, 0)
    const sc = sign('A DOCUMENTARY\nABOUT SNAILS\nPART 7', 20, 9, '#e9e4d4', '#222', 110); sc.position.set(0, 8.5, -11.7); ci.add(sc)
    for (const z of [3.2, 8.2, -1.8]) for (let i = -3; i <= 3; i++) box(ci, 3, 3.4, 0.6, '#7d1f2a', i * 3.6, 1.9, z)
    const glow = new T.PointLight('#fff1d0', 260, 60); glow.position.set(0, 8, -6); ci.add(glow)
    // clock tower in the town
    const tw = new T.Group(); tw.position.set(10.5, 0, -150); scene.add(tw)
    box(tw, 9, 46, 9, '#d9c7a3', 0, 23, 0); box(tw, 10.4, 1.2, 10.4, '#b8a47c', 0, 46.6, 0); const cap = new T.Mesh(new T.ConeGeometry(7.4, 9, 4), mat('#7b3b34')); cap.rotation.y = Math.PI / 4; cap.position.y = 51.6; cap.castShadow = true; tw.add(cap)
    const face = new T.Mesh(new T.CircleGeometry(3.2, 40), new T.MeshBasicMaterial({ color: '#fbf8ee' })); face.position.set(0, 38, 4.56); tw.add(face); box(tw, 0.3, 2.6, 0.1, '#222', 0, 39.2, 4.7); box(tw, 1.8, 0.3, 0.1, '#222', 0.8, 38, 4.7)
    const ld = new T.Group(); for (const x of [-1, 1]) box(ld, 0.3, 15, 0.3, '#c9ced6', x, 7.5, 0); for (let y = 1; y < 15; y += 1.4) box(ld, 2, 0.2, 0.2, '#c9ced6', 0, y, 0); ld.position.set(10.5, 0, -143.6); ld.rotation.x = -0.16; scene.add(ld)
    const truck = new T.Group(); box(truck, 4, 3.2, 9, '#c62828', 0, 2.0, 0); box(truck, 3.8, 1.6, 2.6, '#bfe3ff', 0, 3.4, 3); truck.position.set(15.5, -0.2, -136); scene.add(truck)
    texturize(cr); texturize(ci); texturize(tw) // the sets get the same surfaces as the world
    // cast
    const C = (o) => { const c = Classic(o); scene.add(c.root); return c }
    S.kid = C({ name: 'kid', skin: '#d3ab88', top: { kind: 'jacket', color: '#2a2d3a', print: 'none' }, pants: { kind: 'plain', color: '#22242c' }, hair: { style: 'swept', color: '#231d1c' }, seed: 3 })
    S.pia = C({ name: 'pia', skin: '#e2bb98', top: { kind: 'hoodie', color: '#f2b233' }, pants: { kind: 'jeans' }, hair: { style: 'bun', color: '#3a2620' }, scale: 0.78, seed: 5 })
    S.man = C({ name: 'man', skin: '#c59a74', top: { kind: 'plaid', color: '#b5433a' }, pants: { kind: 'jeans' }, hair: { style: 'messy', color: '#5b4636' }, seed: 8 })
    S.teacher = C({ name: 'teacher', skin: '#e6c3a5', top: { kind: 'tee', color: '#6c4bb5' }, pants: { kind: 'plain', color: '#3a3340' }, hair: { style: 'long', color: '#6b3b25' }, scale: 1.08, seed: 11 })
    S.chief = C({ name: 'chief', skin: '#b98b68', top: { kind: 'jacket', color: '#8a7a2a', print: 'none', inner: '#222' }, pants: { kind: 'stripe', color: '#3b3526' }, hair: { style: 'none' }, scale: 1.1, seed: 14 })
    const helm = new T.Group(); box(helm, 1.5, 0.5, 1.5, '#c62828', 0, 0.78, 0); box(helm, 1.9, 0.12, 2.1, '#c62828', 0, 0.52, -0.1); box(helm, 0.5, 0.36, 0.06, '#f7d23c', 0, 0.8, 0.78).rotation.y = 0; S.chief.parts.head.add(helm); helm.rotation.y = Math.PI
    S.k2 = C({ name: 'k2', skin: '#e2bb98', top: { kind: 'tee', color: '#2e9c6a' }, pants: { kind: 'jeans' }, hair: { style: 'messy', color: '#1d1a1c' }, scale: 0.9, seed: 21 })
    S.k3 = C({ name: 'k3', skin: '#8a6248', top: { kind: 'hoodie', color: '#e2574c' }, pants: { kind: 'plain', color: '#2b2f3c' }, hair: { style: 'bun', color: '#1f1c20' }, scale: 0.9, seed: 23 })
    S.all = [S.kid, S.pia, S.man, S.teacher, S.chief, S.k2, S.k3]
    S.b1 = balloon('#e8392c'); S.b2 = balloon('#f2b233'); S.b3 = balloon('#3d8bfd'); scene.add(S.b1, S.b2, S.b3)
    S.bird = pigeon(); S.hat = hat(); scene.add(S.bird, S.hat)
    S.spoon = new T.Group(); box(S.spoon, 0.12, 1.2, 0.06, '#cfd4dc', 0, 0, 0); const bowl = new T.Mesh(new T.SphereGeometry(0.3, 16, 12), mat('#cfd4dc', 0.3)); bowl.scale.set(1, 1.3, 0.4); bowl.position.y = 0.8; S.spoon.add(bowl); scene.add(S.spoon)
    S.pud = sign('PUDDING', 3.2, 1.3, '#fff3d6', '#7a4a22', 190); scene.add(S.pud)
    return S
  },
  update(env) {
    const { state: S, globalT: t, index: k, raw, dur } = env, p = cl(raw / dur), { kid, pia, man, teacher, chief, k2, k3 } = S
    const d = direct(env, S.all), { show, cam, at, hop, gest, pop, talk, laugh } = d
    let u = raw; const cut = (...ws) => { const n = d.cut(...ws); u = d.u; return n } // u = seconds into the sub-shot
    for (const o of [S.b1, S.b2, S.b3, S.bird, S.hat, S.spoon, S.pud]) o.visible = false
    S.net.visible = k === 6
    const grow = (b, x, y, z, r) => { b.visible = r > 0.01; b.position.set(x, y, z); b.scale.setScalar(Math.max(0.01, r)) }
    const mY = (c, y) => y + 4.24 * c.root.scale.x
    const extras = () => { const z2 = -30 + ((t * 3.4) % 22); show(k2, 2.3, 0, z2, 0, 'neutral'); k2.walk(t * 9); show(k3, 21, 0, 6 - ((t * 3.6) % 50), 180, 'neutral'); k3.walk(t * 9 + 2) }
    let mood = k >= 13 ? 'dusk' : 'day'
    if (k === 0) { // In this town, every time you laugh, a balloon pops out of your mouth.
      const n = cut('laugh', 'balloon'), g = cl((raw - at('balloon')) / 0.45), wz = -7 + raw * 4.4 // walking toward the camera
      if (n === 0) { show(man, 0.4, 0, wz, 0, 'smile'); man.walk(t * 9); show(k3, -1.9, 0, wz - 10, 0, 'neutral'); k3.walk(t * 9 + 2); cam([2.6, 1.6, 9], [0.6, 5.0, -20], 58) }
      else if (n === 1) { show(man, 0.4, 0, 0, 0, 'happy'); laugh(man); hop(man, 0.25, 12); pop(man); cam([-0.6, 4.9, 5.4 - u * 0.5], [0.4, 4.7, 0], 40, 5.6) }
      else { extras(); show(man, 0.4, 0, 0, 0, 'happy'); laugh(man); grow(S.b1, 0.4 + 1.3 * g, mY(man, 0) + g * 2.7, 0.9, g * 1.15); cam([-2.6, 3.6, 9.5], [0.9, 5.6, 0], 48, 9.8) }
    } else if (k === 1) { // A giggle makes one the size of a grape.
      const n = cut('grape'), g = cl((raw - at('grape')) / 0.25); show(pia, 0, 0, 0, 12, 'happy'); pia.pose({ head: [0, 0, Math.sin(t * 11) * 9], armL: [10, 14], armR: [112 + Math.sin(t * 11) * 8, 6] }); pop(pia); grow(S.b2, 0.12, mY(pia, 0) + 0.16, 0.72, g * 0.13)
      if (n === 0) cam([1.3, 3.5, 5.6], [0, 3.35, 0], 40, 5.8); else cam([1.0, 3.5, 3.6 - u * 0.2], [0.1, 3.5, 0.4], 36, 3.2)
    } else if (k === 2) { // A real laugh makes one big enough to lift you off the floor.
      const n = cut('lift'), up = cl((raw - at('lift')) / 0.8) * 3.4; show(man, 0.4, up, 0, 0, 'happy'); laugh(man); man.airborne = up > 0.05; grow(S.b1, 0.4, up + 9.3, 0, n ? 2.7 : 0.6 + cl(raw / at('lift')) * 2.1)
      if (n === 0) { hop(man, 0.3, 12); cam([-1.4, 1.4, 5.6], [0.5, 6.4, 0], 56) } else { man.pose({ legL: [Math.sin(t * 10) * 30], legR: [-Math.sin(t * 10) * 30] }); man.pose({ armL: [150 + Math.sin(t * 12) * 20, 30], armR: [150 - Math.sin(t * 12) * 20, 30], head: [-10, 0, 0] }); cam([2.2, 0.5, 6.5], [0.4, 2.2 + up * 0.5, 0], 50) }
    } else if (k === 3) { // Last year, our teacher laughed at her own joke and spent math class on the ceiling.
      const n = cut('laughed', 'spent', 'ceiling')
      if (n <= 1) { show(teacher, 200, 0.2, -8, 0, n ? 'happy' : 'smile'); if (n) { laugh(teacher); hop(teacher, 0.3, 12); pop(teacher) } else gest(teacher); cam(n ? [201.6, 4.9, -0.6] : [203, 4.2, 6], [200, n ? 4.3 : 5.0, -8], n ? 42 : 50, n ? 7.6 : null); if (n) grow(S.b3, 201.2, 7.6 + u * 2, -7.4, cl(u / 0.4) * 1.0) }
      else { show(teacher, 200, 6.6, -3, 0, 'happy'); teacher.airborne = true; teacher.pose({ armL: [30 + Math.sin(t * 9) * 30, 50], armR: [30 - Math.sin(t * 9) * 30, 50], legL: [Math.sin(t * 8) * 28], legR: [-Math.sin(t * 8) * 28] }); teacher.root.position.y += Math.sin(t * 3) * 0.2; grow(S.b3, 201.6, 12.6 + Math.sin(t * 3) * 0.2, -3, 1.3)
        show(k2, 197.7, 0.2, 5.6, 180, 'oh'); k2.pose({ head: [-28, 0, 0] }); show(k3, 202.3, 0.2, 5.6, 180, 'oh'); k3.pose({ head: [-28, 0, 0] })
        if (n === 2) cam([200.5, 2.4, 19], [200, 8.6, -3], 54); else { k2.root.rotation.y = D(-20); k3.root.rotation.y = D(20); k2.pose({ head: [-28, 0, 0], armR: [160, 10] }); k3.pose({ head: [-28, 0, 0], armL: [150 + Math.sin(t * 10) * 12, 10] }); pop(k2); pop(k3); cam([200, 4.6, 12.6], [200, 4.4, 5.6], 40, 7) } }
    } else if (k === 4) { // So nobody here laughs.
      const n = cut('laughs'), wz = -6 + raw * 3.6; show(man, -2.3, 0, wz, 0, 'neutral'); show(teacher, 0.2, 0, wz - 3.4, 0, 'neutral'); show(k3, 2.5, 0, wz, 0, 'neutral'); man.walk(t * 9); teacher.walk(t * 9 + 2); k3.walk(t * 9 + 4)
      if (n === 0) cam([0.2, 3.0, 13], [0.2, 4.6, wz * 0.5], 46); else cam([0.6, 5.1, wz + 4.2], [0.2, 5.0, wz - 3.4], 40, 7.8)
    } else if (k === 5) { // The cinema only shows documentaries.
      const n = cut('documentaries')
      if (n === 0) { show(k2, -204.6, 0.2, 5, 180); show(man, -200, 0.2, 5, 180); show(k3, -195.4, 0.2, 5, 180); cam([-200, 6.2, 17], [-200, 7.4, -11], 52) }
      else { show(k2, -204.6, 0.2, 5, 0, 'sleep'); k2.pose({ head: [10 + Math.abs(Math.sin(t * 2.2)) * 26, 0, 10] }); man.pose({ head: [0, Math.sin(t * 1.6) * 30, 0] }); k3.setFace('oh'); k3.pose({ armR: [150, 8], armL: [150, 8], head: [-14, 0, 0] }); show(man, -200, 0.2, 5, 0, 'frown'); show(k3, -195.4, 0.2, 5, 0, 'neutral'); cam([-200.6, 4.6, 12.4], [-200, 4.5, 5], 44, 7.4) }
    } else if (k === 6) { // Every classroom has a net.
      const n = cut('net'); show(k2, 197.7, 0.2, 5.6, 0, 'neutral'); show(k3, 202.3, 0.2, 5.6, 0, 'frown'); k2.pose({ head: [-24, 0, 0], armR: [150, 12] }); k3.pose({ head: [-24 * cl(1 - raw), -40 * cl(raw), 0] }); pop(k2)
      if (n === 0) cam([200, 4.2, 15 - u], [200, 4.4, 5.6], 46); else cam([200, 2.6, 15], [200, 8 + u * 5, -2], 56)
    } else if (k === 7) { // And me? I'm the most serious kid in school.
      const n = cut("im"); show(kid, 0, 0, 0, n ? 8 : 40, 'neutral'); talk(kid); if (!n) kid.pose({ head: [0, -38 * cl(1 - u / 0.3), 0] })
      if (n === 0) { extras(); cam([-1.1, 4.75, 6.6], [0.1, 4.6, 0], 38, 6.8) } else cam([1.6, 2.6, 7.4 - u * 0.4], [0.1, 4.3, 0], 46, 7.6)
    } else if (k === 8) { // I have not laughed in 3 years.
      const n = cut('3'); show(kid, -1.6, 0, 0, 10, 'neutral'); show(man, 2.4, 0, 0.2, -62, 'glasses'); man.pose({ armL: [150, 40], armR: [150, 40], head: [0, 0, Math.sin(t * 16) * 14], legL: [Math.sin(t * 16) * 26], legR: [-Math.sin(t * 16) * 26] })
      if (n === 0) cam([0.2, 4.7, 12.5], [0.5, 4.7, 0], 44, 12.6); else { cam([-2.6, 4.7, 7.2], [-1.6, 4.9, 0], 38, 7.3); d.big(3) }
    } else if (k === 9) { // My little sister Pia laughs at everything.
      const n = cut('laughs'), hop = Math.abs(Math.sin(t * 7)) * 0.7; show(pia, 0, hop, 0, -6 + Math.sin(t * 4) * 14, 'happy'); pia.airborne = true; laugh(pia); pia.pose({ legL: [Math.sin(t * 10) * 24], legR: [-Math.sin(t * 10) * 24] })
      grow(S.b2, 0.9, 5.0 + hop + p * 1.2, 0.6, 0.5); grow(S.b1, -1.0, 4.4 + hop + p * 1.8, 0.3, 0.36)
      if (n === 0) cam([0.9, 3.5, 4.6], [0, 3.5 + hop, 0], 38, 4.8); else cam([-1.2, 2.4, 9.5], [0, 4.2, 0], 50)
    } else if (k === 10) { // Spoons. Pigeons. The word "pudding."
      const n = cut('pigeons', 'the'); show(pia, 1.2, 0, 0, -30, 'happy'); laugh(pia); hop(pia, 0.3, 12); pop(pia); cam([0.2, 3.6, 8.2 - u * 0.4], [0.15, 3.4, 0], 40, 8.2)
      if (n === 0) { S.spoon.visible = true; S.spoon.position.set(-0.75, 3.0, 0.6); S.spoon.rotation.z = Math.sin(t * 9) * 0.25; S.spoon.scale.setScalar(1.9) }
      else if (n === 1) { S.bird.visible = true; S.bird.position.set(-0.8, 2.5 + Math.sin(t * 6) * 0.2, 0.6); S.bird.rotation.y = D(60); S.bird.scale.setScalar(1.5); S.bird.userData.flap(t) }
      else { S.pud.visible = true; S.pud.position.set(-0.72, 3.5, 0.6); S.pud.rotation.z = -0.06; S.pud.scale.setScalar(0.55) }
    } else if (k === 11) { // I pull her down by the ankle about 6 times a day.
      const n = cut('ankle', '6'), up = 5.4 + Math.sin(t * 3) * 0.25; show(pia, 0.9, up, 0, 0, 'happy'); pia.airborne = true; pia.pose({ armL: [0, 40], armR: [0, 40] }); grow(S.b2, 0.9, up + 5.6, 0, 1.3)
      const tug = Math.max(0, Math.sin(t * 6)); pia.root.position.y -= tug * 0.5; S.b2.position.y -= tug * 0.5; pia.pose({ legL: [Math.sin(t * 9) * 20], legR: [-Math.sin(t * 9) * 20] })
      show(kid, -0.5, 0, 0, 24, 'neutral'); kid.pose({ armL: [176 - tug * 26, 8], head: [-10, 0, 0], torso: [tug * 5, 0, 0] })
      if (n === 0) cam([2.8, 1.6, 12], [0.3, 6.2, 0], 54); else if (n === 1) cam([3.2, 4.4, 6.6], [0.8, 5.2, 0], 40, 7); else { cam([-1.9, 4.6, 7.4], [-0.5, 4.9, 0], 38, 7.5); d.big(6) }
    } else if (k === 12) { // Then, on Saturday, a pigeon stole a man's hat.
      const n = cut('pigeon', 'stole'), g = cl((raw - at('stole')) / 0.7); show(man, 0.4, 0, 0, 0, g > 0.3 ? 'shout' : 'neutral'); if (g > 0.3) { man.pose({ armL: [165 + Math.sin(t * 14) * 14, 14], armR: [165 - Math.sin(t * 14) * 14, 14], head: [-20, 0, 0] }); hop(man, 0.5, 11) } else if (n === 0) man.pose({ head: [0, Math.sin(t * 2) * 16, 0] })
      S.bird.visible = S.hat.visible = true; S.bird.scale.setScalar(1.4); S.bird.userData.flap(t); S.bird.rotation.y = D(g < 0.5 ? -90 : 90)
      const ex = Math.max(0, raw - at('stole') - 0.7); S.bird.position.set(g < 0.5 ? 6 - g * 11.2 : 0.4 + (g - 0.5) * 9 + ex * 6, 9.5 - Math.sin(Math.min(1, g) * Math.PI) * 3.0 + ex * 3, 0.4)
      S.hat.position.set(g < 0.5 ? 0.4 : S.bird.position.x, g < 0.5 ? 5.34 : S.bird.position.y - 0.5, g < 0.5 ? 0 : 0.4)
      if (n === 0) cam([-0.8, 4.9, 6], [0.4, 5.0, 0], 40, 6.2); else if (n === 1) cam([-1.6, 5.6, 9.5], [S.bird.position.x * 0.6, S.bird.position.y - 1.6, 0.4], 46); else cam([-1.8, 3.4, 11], [0.8, 5.8, 0], 50)
    } else if (k === 13) { // Pia laughed so hard she went up past the roofs and got stuck on top of the clock tower.
      const n = cut('went', 'stuck')
      if (n === 0) { show(pia, 0, 0.2 + Math.abs(Math.sin(t * 12)) * 0.3, 0, 0, 'happy'); pia.airborne = true; laugh(pia, 1.4); pop(pia); grow(S.b2, 0, 5.1 + (0.6 + u * 1.6) * 1.15, 0, 0.6 + u * 1.6); cam([0.8, 3.4, 4.8], [0, 3.6, 0], 40, 5) }
      else if (n === 1) { const up = 3 + u * 16; show(pia, 0, up, -6, Math.sin(t * 3) * 25, 'happy'); pia.airborne = true; laugh(pia); pia.pose({ legL: [Math.sin(t * 11) * 34], legR: [-Math.sin(t * 11) * 34] }); grow(S.b2, 0, up + 6.4, -6, 2.4); cam([2.6, 1.4, 9], [0, up + 2.5, -6], 56) }
      else { show(pia, 10.5, 56.2, -150, 0, 'scared'); pia.airborne = true; pia.pose({ armL: [0, 70], armR: [0, 70] }); cam([9, 3 + u * 1.5, -84], [10.5, 40, -150], 50); S.look = [9, 0, -100] }
    } else if (k === 14) { // "Our ladder is 60 feet," the fire chief said.
      const n = cut('60')
      if (n === 0) { show(chief, 0.2, 0, 0, -8, 'frown'); talk(chief); chief.pose({ armL: [150 + Math.sin(t * 8) * 12, 6], armR: [30 + Math.sin(t * 6) * 14, 12], head: [-14 + Math.sin(t * 7) * 4, Math.sin(t * 2.5) * 12, 0] }); pop(chief); show(kid, -3.0, 0, 3.4, 110, 'neutral'); kid.pose({ head: [-16, 0, 0] }); cam([1.6, 5.0, 6.6], [0, 5.0, 0], 42, 6.8) }
      else { cam([5.5, 2.2, -127], [10.5, 8 + u * 9, -146], 50); S.look = [10, 0, -140]; d.big(60) }
    } else { // "She's at 200."
      const n = cut('200'); show(pia, 10.5 + Math.sin(t * 20) * 0.04, 56.2, -150, Math.sin(t * 2) * 10, 'scared'); pia.airborne = true; pia.pose({ armL: [Math.sin(t * 13) * 16, 70], armR: [-Math.sin(t * 13) * 16, 70], head: [0, Math.sin(t * 5) * 24, 0] })
      if (n === 0) { cam([7, 1.2, -128], [10.5, 20 + u * 26, -150], 60); S.look = [10, 0, -140] }
      else { cam([12.6, 61.4 - u * 0.4, -144.4], [10.5, 59.7, -150], 40, 6.4); S.look = [10.5, 56, -150]; d.big(200) }
    }
    S.mood(mood, k === 3 || k === 6 ? [200, 0, 0] : k === 5 ? [-200, 0, 0] : [S.look[0], 0, S.look[2]])
    d.done()
  },
  render({ renderer, scene, camera, state }) { renderer.toneMapping = T.NoToneMapping; renderShot(renderer, scene, camera, { dof: state.dof, blur: 0.006, aperture: 0.001 }) },
  overlay(env) { captions(env) },
}

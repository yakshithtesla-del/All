// EXAMPLE (copy the patterns, never this story): the game layer, shot presets and effects in one scene.
// Story in this example (6 lines): a kid draws a star -> it becomes a real cat -> it runs into the street -> a car brakes,
// a bin flies -> the kid jumps onto the car to grab it -> midnight: the cat vanishes. Every line: 2-3 shots cut on words.
import { setThree, T, D, cl, Classic, world, indoor, grade, loadMouth, renderShot, loadFonts, box, direct, captions, texturize, life, vehicle, sketchbook, drawOn, DOODLES } from '../lib/blocky/index.js'

function cat() {   // a creature from blocks; it is a prop (carried: not a wall for the body check)
  const g = new T.Group(), c = '#e8892c'; box(g, 0.9, 0.7, 1.8, c, 0, 0.9, 0); box(g, 0.75, 0.7, 0.7, c, 0, 1.45, 1.05)
  for (const s of [-1, 1]) box(g, 0.18, 0.28, 0.12, c, s * 0.24, 1.88, 1.05)
  g.userData.legs = [[-0.3, 0.6], [0.3, 0.6], [-0.3, -0.6], [0.3, -0.6]].map(([x, z]) => box(g, 0.22, 0.6, 0.22, c, x, 0.3, z))
  g.userData.carried = true; texturize(g); return g
}

export default {
  async create({ THREE, scene }) {
    setThree(THREE); await loadFonts()
    const w = world({ kind: 'suburb', theme: 'sunny', seed: 3 }); scene.add(w.root); scene.fog = w.fog
    const S = { mouth: await loadMouth(), mood: w.mood }
    S.room = indoor({ kind: 'bedroom', at: [300, 0, 0], seed: 4 }); scene.add(S.room)                 // rooms far from the street
    const desk = new T.Group(); box(desk, 7, 0.4, 4.4, '#9a6b3e', 0, 3, 0); for (const [x, z] of [[-3.2, -1.9], [3.2, -1.9], [-3.2, 1.9], [3.2, 1.9]]) box(desk, 0.3, 2.8, 0.3, '#7a4f2a', x, 1.4, z)
    desk.position.set(300, 0, -3); texturize(desk); scene.add(desk)
    S.book = sketchbook({ w: 3.2, h: 4.2 }); S.book.position.set(299.4, 3.2, -3); scene.add(S.book)       // drawing on paper
    S.cat = cat(); scene.add(S.cat)
    S.car = vehicle('hatch', '#2f7de8'); scene.add(S.car)                                             // a car the story drives
    S.bin = new T.Group(); box(S.bin, 1.2, 2.2, 1.2, '#2e9c6a', 0, 1.1, 0); S.bin.userData.carried = true; S.bin.position.set(10.5, -0.2, -2); texturize(S.bin); scene.add(S.bin)
    const C = (o) => { const c = Classic(o); scene.add(c.root); return c }
    S.kid = C({ name: 'kid', skin: '#f0c9a6', top: { kind: 'hoodie', color: '#f06aa8' }, pants: { kind: 'jeans' }, hair: { style: 'bun', color: '#5a3216' }, scale: 0.85, seed: 7 })
    S.cast = [S.kid]
    S.L = life(w, { people: 5, cars: 0, seed: 3, stage: [[0, 0, 14], [10.5, 0, 12]] }); scene.add(S.L.root)   // extras walk by themselves
    return S
  },
  update(env) {
    const { state: S, globalT: t, index: k, raw } = env, d = direct(env, [...S.cast, ...S.L.people])
    const { kid } = S; S.cat.visible = false; S.car.visible = k >= 3 && k <= 4; let place = [300, 0, 0]
    if (k === 0) { // line 1: she draws a cat (top-down on the paper), then her face
      d.show(kid, 300.4, 0, 0.8, 180, 'shine'); kid.pose({ head: [26, 0, 0], armR: [55, 4] }); drawOn(S.book, DOODLES.star, cl(raw / 1.6))
      if (raw < 1.6) { d.cam([299.5, 11.5, -1.4], [299.4, 3.2, -3], 40, null); d.allowEmpty() }        // a shot of the paper: no one has to be in frame
      else { d.shot('face', kid); d.talk(kid) }
    } else if (k === 1) { // line 2: it becomes real: sparkles + glow, her O face, music notes
      d.show(kid, 300.4, 0, 0.8, 180, raw < 1 ? 'stare' : 'shock'); drawOn(S.book, DOODLES.star, 1)
      d.appear(S.cat, 0.3, { pos: [300.8, 3.2, -3.4] }); S.cat.rotation.y = D(30)
      if (raw < 1) { d.cam([303.5, 5.4, 3.5], [300.6, 3.6, -3], 44, 7); d.allowEmpty() }              // d.cam for a shot the presets can't make; it shows the cat, so allowEmpty
      else d.shot('face', kid, { side: -25 })
    } else if (k === 2) { // line 3: the cat runs out to the street, she follows AROUND the parked things (walkTo)
      place = [0, 0, 4]; S.cat.visible = true; const cz = 10 - raw * 6; S.cat.position.set(1.5, 0, cz); S.cat.rotation.y = Math.PI
      S.cat.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 14 + (i % 2) * Math.PI) * 0.7 })
      d.walkTo(kid, [-1.5, 16], [-1.5, -8], 'worried', 4.5)                                              // a route around obstacles, legs in step
      if (raw < 1.2) d.shot('wide', kid, { side: 160 }); else d.shot('low', kid, { side: 20 })
    } else if (k === 3) { // line 4: a car brakes, the bin flies (debris, a shake, sounds come by themselves)
      place = [10.5, 0, 0]; d.drive(S.car, [[10.5, 30], [10.5, 3.2]], 0, { speed: 14, accel: 12 })
      d.knock(S.bin, 2.0, { dir: [0.4, -1], mode: 'fly', dist: 7, height: 4 }); d.burst('debris', 2.0, [10.5, 1.2, -2.2], { floor: -0.2 }); d.shake(2.0, 0.45)
      d.show(kid, 4, 0, 6, -100, 'scared'); kid.pose({ armL: [150, 8], armR: [150, 8] })
      if (raw < 1.2) { d.cam([3, 2.4, -14], [10.5, 2.5, 12], 50, null); d.allowEmpty() } else d.shot('medium', kid, { side: -60 })
    } else if (k === 4) { // line 5: she jumps onto the car's roof to grab the cat (lands on the real roof by itself)
      place = [10.5, 0, 3]; S.car.position.set(10.5, -0.2, 3.2); S.car.rotation.y = 0
      const m = d.jump(kid, [6, 0, 5], [10.5, null, 3.2], 0.2, { height: 3 })
      if (raw < 0.9) d.shot('wide', kid, { side: 70 }); else d.shot('low', kid, { side: 40 })
    } else { // line 6: midnight, the cat vanishes in a puff; her tear face; a clock insert first
      if (raw < 0.8) d.insert('clock', '00:00')
      else { d.show(kid, 300.4, 0, 0.8, 180, raw < 1.6 ? 'stare' : 'tear'); S.cat.position.set(300.8, 3.2, -3.4); d.vanish(S.cat, 1.0)
        if (raw < 1.6) { d.cam([303.5, 5.4, 3.5], [300.6, 3.6, -3], 44, 7); d.allowEmpty() } else d.shot('face', kid, { side: 15 }) }
      S.tone = 'night'
    }
    S.L.step(t); S.mood('day', place); d.done()
  },
  render({ renderer, scene, camera, state }) { renderer.toneMapping = T.NoToneMapping; renderShot(renderer, scene, camera, { dof: state.dof }) },
  overlay(env) { grade(env.ctx, env.W, env.H, { look: env.state.tone ?? 'none' }); captions(env) },
}

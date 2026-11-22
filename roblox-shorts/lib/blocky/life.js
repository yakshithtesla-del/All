// Game logic for a living world: NPC people walk the pavements and NPC cars drive the road, seeded, and placed so
// nothing can pass through anything. Every position is a function of time, so each frame (and every re-render) agrees.
//   create():  S.life = life(w, { people: 5, cars: 3, seed: 4, stage: [[0, 0, 8]] }); scene.add(S.life.root)
//   update():  const d = direct(env, [...cast, ...S.life.people]); ... ; S.life.step(env.globalT)   (before d.done())
// How it stays clean:
//   - walk lanes are lines along the street; the world's own solids (hedges, lamps, fences, mailboxes, houses) are
//     measured and a lane only keeps its clear stretches, with room for a body on both sides;
//   - one NPC per lane and lanes at least LANE_GAP apart, so two NPCs never meet; they turn round at a stretch's end;
//   - `stage`: [x, z, radius] circles where the story happens: no lane enters them, so extras never walk into the shot's
//     main characters;
//   - cars drive one lane in one direction at one speed, evenly spaced around a loop, so they never touch; the loop
//     wraps far behind the camera and deep in the fog.
import { T, D } from './core.js'
import { someone } from './classic.js'
import { vehicle, VEHICLES } from './places.js'
import { model } from './models.js'

const rng = (seed) => { let s = 1 + ((seed * 7919) % 2147483646); return () => ((s = (s * 16807) % 2147483647) / 2147483647) }
const LANE_GAP = 4.6, BODY = 2.1 // studs: lanes apart (a body with arms is ~4 wide; the skill says 4.4), and the room a walker needs on each side of their line
// Where people walk and cars drive, per kind of world (the layouts in places.js / world.js).
const PLAN = {
  suburb: { strips: [[-3.0, 3.0], [18.2, 24.0]], z: [-120, 36], road: { x: 10.5, z: [-190, 110] } },
  city: { strips: [[-3.0, 3.0], [18.2, 24.0]], z: [-120, 36], road: { x: 10.5, z: [-190, 110] } },
  plaza: { strips: [[-24, -10], [10, 24]], z: [-24, 24], road: null },
  meadow: { strips: [[-1.6, 1.6], [6, 30]], z: [-60, 30], road: null },
}

/** Clear stretches [z0, z1] of a line at x (along z), given the solids and the story's stage circles. */
function clearStretches(x, [za, zb], solids, stage, minLen = 10) {
  const cuts = []
  for (const b of solids) if (b.min.x - BODY < x && b.max.x + BODY > x) cuts.push([b.min.z - BODY, b.max.z + BODY])
  for (const [sx, sz, r] of stage) { const dx = Math.abs(sx - x); if (dx < r) { const h = Math.sqrt(r * r - dx * dx); cuts.push([sz - h, sz + h]) } }
  cuts.sort((a, b) => a[0] - b[0])
  const out = []; let z = za
  for (const [c0, c1] of cuts) { if (c1 < z) continue; if (c0 > z && Math.min(c0, zb) - z >= minLen) out.push([z, Math.min(c0, zb)]); z = Math.max(z, c1); if (z >= zb) break }
  if (zb - z >= minLen) out.push([z, zb])
  return out
}

/**
 * Bring a world to life. w: from world(). opts: { people (how many walk), cars (how many drive), seed, stage: [[x, z, r]],
 * carModels: [Polyfork vehicle ids] (default: the cars world() was given, else our own vehicles), speed (walk, 2.2),
 * carSpeed (9), dir (1 = cars drive toward the camera, -1 = away), also: [groups] (sets you built in the world:
 * a wall, a stage, a tent; lanes keep clear of them too) }.
 * Returns { root, people (pass them to direct() with the cast), cars, lanes, step(t) }.
 */
export function life(w, { people = 5, cars = 3, seed = 1, stage = [], carModels, speed = 2.2, carSpeed = 9, dir = -1, also = [] } = {}) {
  const r = rng(seed), root = new T.Group(), plan = w.plan ?? PLAN[w.kind] ?? PLAN.suburb
  w.root.updateMatrixWorld(true)
  // the world's solids at body height (the frame check uses the same idea)
  const solids = []
  for (const a of also) a.updateMatrixWorld(true)
  for (const top of [w.root, ...also]) top.traverse((o) => { if (!o.isMesh || o.userData.skyDome || o.userData.shell) return; for (let p = o; p; p = p.parent) { if (p.userData.photoTree || p.userData.vehicle) return }
    const b = new T.Box3().setFromObject(o), sz = b.getSize(new T.Vector3()); if (sz.y > 0.4 && b.max.y > 0.3 && b.min.y < 4 && sz.x < 80 && sz.z < 80) solids.push(b) })
  // candidate lines across each strip, best-covered first, at least LANE_GAP apart
  const lanes = []
  for (const [x0, x1] of plan.strips) {
    const cands = []; for (let x = x0; x <= x1 + 1e-6; x += 0.4) { const st = clearStretches(x, plan.z, solids, stage); const len = st.reduce((a, [p, q]) => a + q - p, 0); if (len) cands.push({ x, st, len }) }
    cands.sort((a, b) => b.len - a.len)
    for (const c of cands) if (lanes.every((l) => Math.abs(l.x - c.x) >= LANE_GAP)) lanes.push(c)
  }
  // one walker per lane, on that lane's longest clear stretch
  const walkers = [], picked = lanes.slice().sort(() => r() - 0.5).slice(0, people)
  for (const l of picked) {
    const [z0, z1] = l.st.reduce((a, s) => (s[1] - s[0] > a[1] - a[0] ? s : a)), c = someone(Math.floor(r() * 1e6)); c.name = `npc${walkers.length + 1}`
    root.add(c.root); walkers.push({ c, x: l.x, z0, z1, ph: r(), sp: speed * (0.85 + r() * 0.3) })
  }
  // cars: one direction, one speed, evenly spaced around a loop
  const loop = plan.road ? plan.road.z : null, vs = []
  if (loop) {
    const ids = carModels ?? w.cars ?? [], L = loop[1] - loop[0], n = Math.min(cars, Math.floor(L / 40))
    for (let i = 0; i < n; i++) { const v = ids.length ? model(ids[Math.floor(r() * ids.length)]) : vehicle(VEHICLES[Math.floor(r() * 3)], ['#d8433b', '#2f7de8', '#2e9c6a', '#f4f4f4', '#22242c'][Math.floor(r() * 5)]); root.add(v); vs.push({ v, off: (i / n) * L + r() * 6 }) }
  }
  const TURN = 0.6
  function step(t) {
    for (const k of walkers) { // ping-pong along the stretch, turning round at each end
      const len = k.z1 - k.z0, leg = len / k.sp, P = 2 * (leg + TURN), u = (t + k.ph * P) % P, c = k.c
      c.root.visible = true; c.root.rotation.set(0, 0, 0)
      if (u < leg) { c.root.position.set(k.x, 0, k.z1 - u * k.sp); c.root.rotation.y = Math.PI; c.walk(t * 3.6 * k.sp) }
      else if (u < leg + TURN) { c.root.position.set(k.x, 0, k.z0); c.root.rotation.y = Math.PI + Math.PI * ((u - leg) / TURN); c.idle(t) }
      else if (u < 2 * leg + TURN) { c.root.position.set(k.x, 0, k.z0 + (u - leg - TURN) * k.sp); c.root.rotation.y = 0; c.walk(t * 3.6 * k.sp) }
      else { c.root.position.set(k.x, 0, k.z1); c.root.rotation.y = Math.PI * ((u - 2 * leg - TURN) / TURN); c.idle(t) }
    }
    if (loop) { const L = loop[1] - loop[0]
      for (const { v, off } of vs) { const s = (((t * carSpeed + off) % L) + L) % L, z = dir < 0 ? loop[1] - s : loop[0] + s
        v.visible = true; v.position.set(plan.road.x, -0.2, z); v.rotation.y = dir < 0 ? Math.PI : 0
        for (const wh of ['wheel-fl', 'wheel-fr', 'wheel-rl', 'wheel-rr']) v.userData.part?.(wh, (t * carSpeed * 40) % 180) } }
  }
  step(0)
  return { root, people: walkers.map((k) => k.c), cars: vs.map((x) => x.v), lanes, step }
}

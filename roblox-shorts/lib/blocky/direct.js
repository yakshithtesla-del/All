// Directing helpers: the things every scene needs, so a scene is only its story. See api.md.
//   create:  await loadFonts(); box(...); sign(...)
//   update:  const d = direct(env, cast)   -> d.show, d.cam, d.closeUp, d.at, d.cut, d.hop, d.gest, d.pop, d.talk, d.big, d.done
//   overlay: captions(env)
import { T, D, cl } from './core.js'
import { clearSpot, camClear, navPath, along, groundAt, ballistic } from './game.js'
import { burstAt, resetBursts } from './burst.js'
import { mouthAt } from './lipsync.js'
import { report, banner } from './check.js'
import { loadSurfaces } from './places.js'

/** Load the caption font. Call once at the top of create(). */
export async function loadFonts() {
  for (const [w, f] of [['600', 'SemiBold'], ['700', 'Bold']]) { const ff = new FontFace('Montserrat', `url(/fonts/Montserrat-${f}.ttf)`, { weight: w }); await ff.load(); document.fonts.add(ff) }
  await loadSurfaces() // the photo textures for world(), indoor() and texturize()
}
export const mat = (color, rough = 0.8) => new T.MeshStandardMaterial({ color, roughness: rough })
/** A block: size w (x), h (y), d (z), centred at x, y, z inside parent. */
export function box(parent, w, h, d, color, x, y, z) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m }
/** A flat sign w x h studs with words on it. Lines are split with \n. The text is shrunk until it fits. */
export function sign(text, w, h, bg = '#111', fg = '#fff', size = 90) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round((1024 * h) / w); const g = c.getContext('2d'), lines = String(text).split('\n')
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height)
  const fits = () => { g.font = `700 ${size}px Montserrat, sans-serif`; return lines.every((l) => g.measureText(l).width <= c.width * 0.9) && lines.length * size * 1.2 <= c.height * 0.92 }
  while (!fits() && size > 12) size -= 4
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'
  lines.forEach((l, i) => g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * size * 1.2))
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace
  return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: t }))
}

/** Walking on the spot: legs walking while the body stays put reads as a moonwalk. Compares this frame with the last one. */
function onTheSpot(cast, t, shot) {
  const seen = (window.FK_WALK ??= {}), out = []
  for (const c of cast) { if (!c.root.visible || !c.walking || c.treadmill) continue
    const p = c.root.position, prev = seen[c.name]; seen[c.name] = { t, shot, x: p.x, z: p.z }
    if (prev && prev.shot === shot && t > prev.t && t - prev.t < 0.1 && Math.hypot(p.x - prev.x, p.z - prev.z) / (t - prev.t) < 0.4) out.push(`CLIP: ${c.name} walks on the spot (use d.walk, which moves them the way they face)`) }
  return out
}
/** Vehicles in the frame check: a vehicle may not pass through another vehicle or a person. Only what the camera can see counts. */
let _b2, _fr, _pm
function vehicleClips(scene, cast, camera) {
  if (!scene) return []
  _b2 ??= new T.Box3(); _fr ??= new T.Frustum(); _pm ??= new T.Matrix4() // made on first use: three.js arrives with setThree()
  camera.updateMatrixWorld(); _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm)
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true }
  const cars = []; scene.traverse((o) => { if (o.userData.vehicle && shown(o)) { const b = new T.Box3().setFromObject(o); b.expandByScalar(-0.25); if (_fr.intersectsBox(b)) cars.push([o, b]) } })
  const out = []
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) if (cars[i][1].intersectsBox(cars[j][1])) out.push(`CLIP: a ${cars[i][0].userData.vehicle} and a ${cars[j][0].userData.vehicle} pass through each other`)
    for (const c of cast) { if (!c.root.visible || c.riding) continue; for (const k of ['torso', 'legL', 'legR']) { const pt = c.parts[k]; if (!pt) continue; _b2.setFromObject(pt); if (cars[i][1].intersectsBox(_b2)) { out.push(`CLIP: ${c.name} is inside a ${cars[i][0].userData.vehicle}`); break } } }
  }
  return out
}

/**
 * People inside the world: a body standing in a hedge, a fence, a wall, a bush, a lamp post, a house or a model prop.
 * The world (world(), indoor()) is measured once; model props (not vehicles) every frame, since scenes move them.
 * Someone meant to lean on, sit in or stand in something (a bed, a chair, a doorway) sets c.touching = true for that frame.
 */
function propClips(scene, cast, camera) {
  if (!scene) return []
  scene.updateMatrixWorld(true) // before the first render every matrix is still at the origin
  const inside = (o, key) => { for (let p = o; p; p = p.parent) if (p.userData[key]) return p; return null }
  const shown = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true } // a hidden prop (its group hidden) is not a wall
  const keep = (o) => o.isMesh && shown(o) && !inside(o, 'carried') && !(o.material?.transparent && o.material?.depthWrite === false) && !inside(o, 'photoTree') && !inside(o, 'vehicle') && !inside(o, 'skyDome') && !inside(o, 'shell') && !cast.some((c) => inside(o, 'castRoot') === c.root)
  const boxOf = (o) => { const b = new T.Box3().setFromObject(o), sz = b.getSize(new T.Vector3()); return sz.y > 0.5 && b.max.y > 0.4 && b.min.y < 4 && sz.x < 80 && sz.z < 80 ? b.expandByScalar(-0.12) : null }
  if (!scene.userData.solids) { const list = []; scene.traverse((o) => { if (keep(o) && inside(o, 'world') && (!inside(o, 'model') || inside(o, 'fixed'))) { const b = boxOf(o); if (b) list.push([b, o.userData.tex && o.userData.tex !== 'none' ? o.userData.tex : 'part of the set']) } }); scene.userData.solids = list }
  const live = []; scene.traverse((o) => { if (keep(o) && inside(o, 'model') && !inside(o, 'fixed')) { const b = boxOf(o); if (b) live.push([b, `the ${inside(o, 'model').userData.model}`]) } })
  const out = [], pb = new T.Box3()
  for (const c of cast) { if (!c.root.visible || c.touching || c.riding || c.airborne) continue
    for (const k of ['torso', 'legL', 'legR']) { const pt = c.parts[k]; if (!pt) continue; pb.setFromObject(pt).expandByScalar(-0.1)
      const hit = scene.userData.solids.find(([b]) => b.intersectsBox(pb)) ?? live.find(([b]) => b.intersectsBox(pb))
      if (hit) { out.push(`CLIP: ${c.name} stands inside the world (${hit[1]} at x ${hit[0].getCenter(new T.Vector3()).x.toFixed(1)}, z ${hit[0].getCenter(new T.Vector3()).z.toFixed(1)}): move them or the camera's story spot`); break } } }
  return out
}

/**
 * Call first in update(). It hides and resets every character in `cast` (they breathe by default), then returns the
 * helpers below. env is update()'s argument; state must hold `mouth` (from loadMouth()) for lip-sync.
 */
export function direct(env, cast) {
  const { camera, state, globalT: t, raw, words, index = 0 } = env, lineStart = t - raw
  const log = (window.FK_EVENTS = []) // what appears on screen this frame; the render turns it into sound effects (audio/sfx-plan.mjs)
  for (const c of cast) { c.root.userData.castRoot = true; c.touching = false; c.standOn = 0; c.talking = false; c.root.scale.y = c.root.scale.x; c.root.visible = false; c.root.rotation.set(0, 0, 0); c.airborne = false; c.walking = false; c.standing = true; c.speak(null); c.pose({ legL: [0], legR: [0], torso: [0, 0, 0] }); c.idle(t) }
  resetBursts(env.scene); state.alive = []; state.shakes = []; state.allowEmpty = false; state.framing = []
  state.insert = null; state.big = null; state.dof = null; state.look = [0, 0, 0]; state.tone = 'none'
  const bare = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')
  const speaking = words.some((w) => raw >= w.start && raw < w.end)
  const d = {
    /** Seconds since the current sub-shot started (set by cut). */
    u: raw, n: 0, t0: 0,
    /** Show a character at x, y, z, turned ry degrees (0 = facing the camera side, +z), with a face. */
    show(c, x, y, z, ry = 0, face = 'neutral') { c.root.visible = true; c.root.position.set(x, y, z); c.root.rotation.y = D(ry); c.setFace(face); return c },
    /**
     * Walk: show a character at x, y, z at the start of this sub-shot, turned ry degrees, and move them the way they face
     * at `speed` studs a second (2.4 walk, 5 run), legs in step. Use this for anyone walking; c.walk() alone walks on the spot.
     */
    walk(c, x, y, z, ry = 0, face = 'neutral', speed = 2.4) { const a = D(ry), s = speed * d.u; d.show(c, x + Math.sin(a) * s, y, z + Math.cos(a) * s, ry, face); c.walk(t * 3.6 * speed); return c },
    /** Place the camera. dof = distance to the subject for a soft background, or null for a sharp frame. */
    /** Place the camera, never behind a wall or prop: if one sits between camera and subject, it swings round or pulls in
     * (game.js camClear). d.camFree(...) takes the camera exactly where you put it (a deliberate shot through something). */
    camFree(pos, look, fov = 44, dof) { d.free = true; d.cam(pos, look, fov, dof); d.free = false },
    cam(pos, look, fov = 44, dof) { if (!d.free && env.scene) pos = camClear(env.scene, pos, look); if (dof === undefined) { const dd = Math.hypot(pos[0] - look[0], pos[1] - look[1], pos[2] - look[2]); dof = dd < 20 ? dd : null } /* close shots get a soft background by default; pass null for a sharp frame */ camera.fov = fov; camera.near = 0.1; camera.far = 900; camera.updateProjectionMatrix(); camera.position.set(...pos); camera.lookAt(...look); state.dof = dof; state.look = look },
    /**
     * Walk to a spot AROUND obstacles (game.js navPath: walls, props, cars, houses): from [x, z] to [x, z] at floor y,
     * starting `delay` seconds into the sub-shot, at `speed` (2.4 walk, 5 run). Turns at the corners, legs in step with
     * the ground covered, stops and stands on arrival. Returns { arrived }.
     */
    walkTo(c, from, to, face = 'neutral', speed = 2.4, y = 0, delay = 0) {
      const s = c.root.scale.x, route = navPath(env.scene, from[0], from[1], to[0], to[1], s, y), dist = speed * Math.max(0, d.u - delay), p = along(route, dist)
      d.show(c, p.x, y, p.z, (p.yaw * 180) / Math.PI, face); if (!p.done && d.u > delay) c.walk(3.6 * dist / s); return { arrived: p.done }
    },
    /**
     * A fall (or a throw) as real motion with gravity, landing on whatever is really below (a roof, a car, a loaf; game.js
     * groundAt) with a squash and bounces. o: { x, y0, z, vx, vy, vz (studs/s), g (60 = a quick fall; 25 = slow motion),
     * at: a word of this line or seconds into it, or { global: seconds of the video } for a fall that spans lines,
     * landY (skip the auto ground), faces: [air, landing, after] }. Arms go up in the air like the game. Returns the motion.
     */
    fall(c, o = {}) {
      const t0 = typeof o.at === 'object' ? o.at.global : lineStart + (typeof o.at === 'string' ? d.at(o.at) : o.at ?? 0), tt = t - t0
      const key = `fall:${c.name}:${t0.toFixed(2)}:${o.x},${o.y0},${o.z},${o.vx ?? 0},${o.vz ?? 0}`, cache = (state.fallCache ??= {})
      if (!(key in cache)) { let landY = o.landY ?? groundAt(env.scene, o.x, o.z, (o.y0 ?? 0) - 0.05)
        if (o.landY === undefined && (o.vx || o.vz)) { const m = ballistic(1e3, { ...o, landY }); landY = groundAt(env.scene, m.x, m.z, (o.y0 ?? 0) - 0.05) } cache[key] = landY }
      const m = ballistic(Math.max(0, tt), { ...o, landY: cache[key] }), [fa, fl, fafter] = o.faces ?? ['scream', 'dizzy', 'happy']
      if (tt < 0 && tt > -(o.slip ?? 0.45) && !o.noSlip) { d.show(c, o.x, o.y0 ?? 0, o.z, o.turn ?? 0, 'scared'); c.airborne = true; c.touching = true; const w = 1 + tt / (o.slip ?? 0.45)
        c.pose({ armL: [120 + Math.sin(t * 24) * 50, 40], armR: [120 - Math.sin(t * 24) * 50, 40] }); c.root.rotation.z = Math.sin(t * 13) * 0.18 * w; c.root.rotation.x = 0.15 * w; return m }   // the slip before the fall
      if (tt >= 0) d.auto('swoosh', t0, `${key}:go`, -8); if (m.landed) d.auto('pop', t - m.after, `${key}:land`, -2)
      { const drop = (o.y0 ?? 0) - cache[key]; if (m.landed) burstAt(env.scene, 'puff', m.after, [m.x, cache[key] + 0.3, m.z], { size: Math.min(2.4, 0.9 + drop * 0.08), seed: 11 })   // automatic: dust where they land
        if ((o.vy ?? 0) > 1 && tt >= 0) burstAt(env.scene, 'puff', tt, [o.x, (o.y0 ?? 0) + 0.2, o.z], { size: 0.9, n: 6, seed: 12 }) }   // and where a jump takes off
      d.show(c, m.x, m.y, m.z, o.turn ?? 0, !m.landed ? fa : m.after < 0.5 ? fl : fafter)
      c.airborne = m.air; c.touching = true; if (m.landed && !m.air && cache[key] > 0.05) c.standOn = cache[key]; (state.alive ??= []).push({ c, m, tt, drop: (o.y0 ?? 0) - cache[key] })   // standing on a roof / car: not 'floating'
      if (m.air) c.pose({ armL: [170, 12], armR: [170, 12], legL: [Math.sin(t * 14) * 25, 4], legR: [-Math.sin(t * 14) * 25, 4] })
      if (m.squash) { c.root.scale.y = c.root.scale.x * (1 - m.squash) }
      return m
    },
    /** A jump from [x, y, z] to [x, y, z] (onto a car, over a fence, off a roof) peaking `height` above the start, at a word
     * or seconds into the line. Same landing as fall(). */
    jump(c, from, to, at = 0, { height = 3, g = 60, turn, faces, dur } = {}) {
      if (to[1] == null) to = [to[0], groundAt(env.scene, to[0], to[2]), to[2]]   // land on whatever is there (a car roof, a wall top)
      const peak = Math.max(from[1], to[1]) + height, vy = dur ? (to[1] - from[1]) / dur + (g * dur) / 2 : Math.sqrt(2 * g * (peak - from[1])), tl = dur ?? (vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * (from[1] - to[1])))) / g   // dur: land exactly dur seconds later; else peak `height` above the higher end
      return d.fall(c, { x: from[0], y0: from[1], z: from[2], vx: (to[0] - from[0]) / tl, vz: (to[2] - from[2]) / tl, vy, g, at, landY: to[1], turn: turn ?? (Math.atan2(to[0] - from[0], to[2] - from[2]) * 180) / Math.PI, faces: faces ?? ['happy', 'grin', 'happy'] })
    },
    /** A full-frame insert shot for this sub-shot (call it in the shot instead of placing the camera on the world):
     * 'clock' big red digits on black ("11:59"), 'phone' a dark timer pill ("23:59:58"), 'note' a paper note in a serif
     * face (text with \n), 'sign' a bold printed sign (opts.color: '#d8322c' red caps, '#2e9c4a' green). Drawn in overlay. */
    insert(kind, text, opts = {}) { state.insert = { kind, text, u: d.u, ...opts }; d.auto('click', t - d.u, `insert:${kind}:${text}`) },
    /** (engine) log a sound at a time in the video: the planner places it (Mr omi: every visible event sounds). */
    auto(name, atG, key, gain = 0) { if (atG < 1e8) log.push({ kind: 'sfx', key: `auto:${key}`, at: atG, name, gain, pitch: 0, what: key }) },
    /** Seconds of the video for a word of this line, seconds into it, or { global: seconds } (for things that span lines). */
    when(at) { return typeof at === 'object' && at ? at.global : lineStart + (typeof at === 'string' ? d.at(at) : at ?? 0) },
    /** A one-shot effect at [x, y, z] when `at` comes: 'sparkle' | 'puff' | 'debris' | 'notes' | 'feathers' | 'confetti'.
     * opts: { n, size, color, spread, floor, seed } (burst.js). Call it every frame of the shot, like everything else. */
    burst(kind, at, pos, opts = {}) { const g = d.when(at); burstAt(env.scene, kind, t - g, pos, opts); if (t >= g) d.auto({ sparkle: 'ting', puff: 'pop', debris: 'drop', notes: 'pop', feathers: 'swoosh', confetti: 'pop' }[kind], g, `burst:${kind}:${g.toFixed(2)}`, kind === 'feathers' ? -8 : -3) },
    /** Something drawn/magic appears: it pops in from nothing (0 -> 1.12 -> 1) with sparkles and a white glow flash.
     * obj: a group or model; size: its normal scale. Before `at` it is hidden. */
    appear(obj, at, { size = 1, pos } = {}) {
      const a = t - d.when(at); if (pos) obj.position.set(...pos)
      if (a < 0) { obj.visible = false; return } obj.visible = true; d.auto('ting', d.when(at), `appear:${obj.uuid}`)
      const k = Math.min(1, a / 0.35), s = a < 0.35 ? (k < 0.7 ? (k / 0.7) * 1.12 : 1.12 - ((k - 0.7) / 0.3) * 0.12) : 1; obj.scale.setScalar(Math.max(0.001, size * s))
      const p = obj.position; burstAt(env.scene, 'sparkle', a, [p.x, p.y + 1.2 * size, p.z], { size: 1.3 * size, spread: 1.4 * size, n: 16 })
      if (!obj.userData.ownMats) { obj.traverse((o) => { if (o.isMesh && o.material) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone() }); obj.userData.ownMats = true }   // its own materials: the glow lights only this one
      const glow = Math.max(0, 1 - a / 0.5); obj.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) m?.emissive?.setRGB(glow, glow, glow) })
    },
    /** Something vanishes: shrinks away in a puff of dust + a few sparkles. Hidden after. */
    vanish(obj, at, { size = 1 } = {}) {
      const a = t - d.when(at), p = obj.position; if (a < 0) { obj.visible = true; obj.scale.setScalar(size); return } d.auto('pop', d.when(at), `vanish:${obj.uuid}`)
      obj.visible = a < 0.3; obj.scale.setScalar(Math.max(0.001, size * (1 - a / 0.3)))
      burstAt(env.scene, 'puff', a, [p.x, p.y + 1 * size, p.z], { size: 1.6 * size, spread: 1.2 * size }); burstAt(env.scene, 'sparkle', a, [p.x, p.y + 1.2 * size, p.z], { n: 6, size: size })
    },
    /** A quick camera shake when `at` comes (an impact, a slam): strength in studs (0.3 small, 0.8 big), dies in `dur` s. */
    shake(at, strength = 0.4, dur = 0.35) { state.shakes.push([d.when(at), strength, dur]) },
    /** Knock something over when `at` comes: mode 'tip' (falls over on its side, a small bounce) or 'fly' (thrown with
     * spin in direction dir [dx, dz], landing on the ground). obj: a group standing on y = its base. */
    knock(obj, at, { dir = [1, 0], mode = 'tip', dist = 6, height = 3 } = {}) {
      const a = t - d.when(at), L = Math.hypot(dir[0], dir[1]) || 1, ux = dir[0] / L, uz = dir[1] / L
      obj.userData.base ??= obj.position.clone(); const b = obj.userData.base; obj.position.copy(b); obj.rotation.set(0, obj.rotation.y, 0)
      if (a <= 0) return
      d.auto(mode === 'tip' ? 'drop' : 'break', d.when(at), `knock:${obj.uuid}`, mode === 'tip' ? 0 : -2)
      burstAt(env.scene, 'puff', a, [b.x, b.y + 0.8, b.z], { size: 1.2, n: 7 }); if (mode === 'fly') burstAt(env.scene, 'debris', a, [b.x, b.y + 1, b.z], { floor: b.y, n: 6, size: 0.8 })   // automatic dust (and bits)
      if (mode === 'tip') { const k = Math.min(1, a / 0.38), ang = (Math.PI / 2) * (k * k) - (a > 0.38 && a < 0.6 ? Math.sin(((a - 0.38) / 0.22) * Math.PI) * 0.12 : 0)
        obj.rotation.x = uz * ang; obj.rotation.z = -ux * ang; obj.position.x = b.x + ux * Math.sin(ang) * 0.6; obj.position.z = b.z + uz * Math.sin(ang) * 0.6 }
      else { const m = ballistic(a, { x: b.x, y0: b.y, z: b.z, vx: ux * dist, vz: uz * dist, vy: Math.sqrt(2 * 60 * height), g: 60, landY: b.y }); obj.position.set(m.x, m.y, m.z); const sp = m.landed ? Math.min(1, m.after * 3) : 1; obj.rotation.x = uz * (m.landed ? Math.PI / 2 : a * 9); obj.rotation.z = -ux * (m.landed ? Math.PI / 2 : a * 9) * sp }
    },
    /** A car driving a route [[x, z], ...] (keep to the road lanes), from `at`: speeds up (accel), turns smoothly at the
     * corners, brakes to a stop at the end; wheels spin if the model has them. y = road height (-0.2). Returns { stopped }. */
    drive(car, route, at, { speed = 10, accel = 8, y = -0.2 } = {}) {
      const a = Math.max(0, t - d.when(at)), total = route.slice(1).reduce((s_, p, i) => s_ + Math.hypot(p[0] - route[i][0], p[1] - route[i][1]), 0)
      const ta = speed / accel, da = (speed * ta) / 2, cruise = Math.max(0, total - 2 * da), tc = cruise / speed, T_ = 2 * ta + tc
      const dist = a < ta ? (accel * a * a) / 2 : a < ta + tc ? da + speed * (a - ta) : a < T_ ? total - (accel * (T_ - a) ** 2) / 2 : total
      const p = along(route, dist), q = along(route, Math.min(total, dist + 2.5)), yaw = Math.atan2(q.x - p.x, q.z - p.z) || p.yaw   // look ahead: turns ease in
      car.position.set(p.x, y, p.z); car.rotation.y = yaw
      if (a > ta + tc && a < T_ + 0.2 && speed > 8) burstAt(env.scene, 'puff', a - (ta + tc), [p.x, y + 0.4, p.z - Math.cos(yaw) * 1.5], { size: 0.8, n: 5, life: 0.9, seed: 21 })   // automatic: tyre dust when it brakes
      for (const w of ['wheel-fl', 'wheel-fr', 'wheel-rl', 'wheel-rr']) car.userData.part?.(w, (dist / 1.1) * (180 / Math.PI))
      return { stopped: a >= T_ }
    },
    /**
     * A close-up of a character that keeps the face in the upper half, clear of the captions.
     * side: degrees around them (0 = straight on, 30 = from their left); tight: 1 = normal, 0.8 = closer, 1.4 = medium;
     * low: camera height offset in studs (negative = low angle).
     */
    closeUp(c, { side = 0, tight = 1, low = 0, lens = 39 } = {}) {
      const s = c.root.scale.x, p = c.root.position, a = c.root.rotation.y + D(side), dist = 7.2 * s * tight, fy = p.y + 4.45 * s
      d.cam([p.x + Math.sin(a) * dist, fy + 0.2 * s + low, p.z + Math.cos(a) * dist], [p.x, fy - 0.75 * s * tight, p.z], lens, dist)
    },
    /** When a word of this line is spoken (seconds into the line). at('the', 2) = the second "the". Unknown word: never. */
    at(word, nth = 1) { const hits = words.filter((x) => bare(x.word) === bare(word)); return hits[nth - 1] ? hits[nth - 1].start : 1e9 },
    /**
     * Sub-shots inside one line: cut('laugh', 'balloon') is 0 before "laugh", 1 from "laugh", 2 from "balloon".
     * A word may be ['the', 2] for its second use. Afterwards d.u is the time since that sub-shot began.
     */
    cut(...ws) { let n = 0, t0 = 0; for (const w of ws) { const a = (Array.isArray(w) ? d.at(...w) : d.at(w)) - 0.06; if (raw >= a) { n++; t0 = a } } d.u = raw - t0; d.n = n; d.t0 = t0; return n },
    /** Bounce on the spot (laughing, excited, angry). Marks them airborne for the frame check. */
    hop(c, amt = 0.35, speed = 9) { c.root.position.y += Math.abs(Math.sin(t * speed)) * amt; c.airborne = true },
    /** Hands and head move, for someone who is talking or explaining. */
    gest(c) { c.pose({ armR: [58 + Math.sin(t * 7) * 26, 16], armL: [24 + Math.sin(t * 5 + 1) * 18, 10], head: [Math.sin(t * 8) * 4, Math.sin(t * 2.3) * 8, 0] }) },
    /** A quick squash and stretch in the first 0.2 s of a sub-shot. Call it after cut(). */
    pop(c) { log.push({ kind: 'pop', key: `pop:${index}:${d.n}:${c.name}`, at: lineStart + d.t0, name: c.name }); const q = cl(d.u / 0.2), b = c.root.scale.x; c.root.scale.y = b * (1 + 0.14 * Math.sin(q * Math.PI) * (1 - q)) },
    /** This character is the one speaking the line: their mouth follows the voice. */
    talk(c) { c.talking = true; c.speak(speaking ? mouthAt(state.mouth, t) : null) },
    /** Laughing body: arms out, head bobbing. */
    laugh(c, amt = 1) { c.pose({ armL: [20 * amt, 30 * amt], armR: [20 * amt, 30 * amt], head: [-10 + Math.sin(t * 18) * 5 * amt, 0, 0], torso: [-6 * amt, 0, 0] }) },
    /** A big number or word at the top of the frame for this moment (it covers the top 30 %). */
    big(text) {
      const bl = (state.bigLines ??= {}); bl[index] = true
      if (!/\d/.test(String(text))) state.framing.push(`BIG: "${text}" is not a number; d.big is for a counted number the line says`)
      if (bl[index - 1]) state.framing.push(`BIG: line ${index} and line ${index + 1} both show a big number; keep them for the numbers that matter`)
      state.big = String(text); log.push({ kind: 'big', key: `big:${index}:${text}`, at: t, text: String(text) })
    },
    /** This shot shows a thing, not a person (a frog, a sign, an empty street): no one has to be in frame. */
    allowEmpty() { state.allowEmpty = true },
    /**
     * Shot presets that frame people correctly by themselves (heads never cut, the face in the upper half):
     *   d.shot('face', c, { side })     close-up              d.shot('medium', c, { side })  waist up
     *   d.shot('wide', c, { side })     whole body + place    d.shot('low', c, { side })     low hero angle
     *   d.shot('top', c)                looking down          d.shot('ots', a, { at: b })    over a's shoulder at b
     *   d.shot('two', a, { with: b })   both in frame
     * side: degrees around them (0 = from the front, the way they face). dof is set for a soft background.
     */
    shot(kind, c, { side = 0, at: other, with: pal, lens } = {}) {
      const s = c.root.scale.x, p = c.root.position, a = c.root.rotation.y + D(side), head = p.y + 4.45 * s
      const around = (dist, h, lookY, fov) => d.cam([p.x + Math.sin(a) * dist, h, p.z + Math.cos(a) * dist], [p.x, lookY, p.z], lens ?? fov, dist)
      if (kind === 'face') return d.closeUp(c, { side, tight: 0.95 })
      if (kind === 'medium') return around(11 * s, head - 0.2 * s, head - 1.1 * s, 42)
      if (kind === 'wide') return around(19 * s, p.y + 4.2 * s, p.y + 2.8 * s, 50)
      if (kind === 'low') return around(9 * s, p.y + 1.1 * s, head - 0.3 * s, 46)
      if (kind === 'top') return d.cam([p.x + Math.sin(a) * 2 * s, p.y + 15 * s, p.z + Math.cos(a) * 2 * s], [p.x, p.y + 1.5 * s, p.z], lens ?? 46, 15 * s)
      if (kind === 'ots' && other) { const q = other.root.position, qs = other.root.scale.x, dx = p.x - q.x, dz = p.z - q.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L
        return d.cam([p.x + ux * 3.2 * s - uz * 1.4 * s, head + 0.4 * s, p.z + uz * 3.2 * s + ux * 1.4 * s], [q.x, q.y + 4.3 * qs, q.z], lens ?? 42, L + 3.2 * s) }
      if (kind === 'two' && pal) { const q = pal.root.position, mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, sep = Math.hypot(p.x - q.x, p.z - q.z), dist = Math.max(10, sep * 2.1) * s, aa = Math.atan2(q.x - p.x, q.z - p.z) + Math.PI / 2 + D(side)
        return d.cam([mx + Math.sin(aa) * dist, head - 0.4 * s, mz + Math.cos(aa) * dist], [mx, head - 1.2 * s, mz], lens ?? 46, dist) }
      throw new Error(`d.shot: unknown kind "${kind}" (face, medium, wide, low, top, ots, two)`)
    },
    /**
     * A sound for a story moment: d.sfx('hit', 'door') plays it when "door" is said, d.sfx('whoosh', 1.2) 1.2 s into the line.
     * Sounds: whoosh, whoosh2, swoosh, click, pop, ting, camera, snap, break, hit, drop. opts: { gain (dB), pitch (semitones) }.
     */
    sfx(name, at, { gain = 0, pitch = 0 } = {}) { const s = typeof at === 'string' ? d.at(at) : at ?? d.t0; if (s < 1e8) log.push({ kind: 'sfx', key: `sfx:${index}:${name}:${at}`, at: lineStart + s, name, gain, pitch }) },
    /** Call last in update(): runs the frame check on everyone visible who is standing on the floor at height floorY. */
    done(floorY = 0) {
      { const cp = camera.position, pc = state.prevCam, dt = pc ? t - pc[3] : 1   // a cut the scene made without d.cut (a camera jump between two frames): log it like a shot
        if (pc && dt > 0 && dt < 0.1 && Math.hypot(cp.x - pc[0], cp.y - pc[1], cp.z - pc[2]) > 1.5 && !state.insert) log.push({ kind: 'shot', key: `jump:${t.toFixed(2)}`, at: t, cam: [cp.x, cp.y, cp.z] })
        state.prevCam = [cp.x, cp.y, cp.z, t] }
      for (const { c, m, tt, drop } of state.alive ?? []) { const J = c.joints; if (!J) continue   // a fall stays alive whatever pose the scene set
        if (m.air && !m.landed) { const f = Math.min(1, tt / 0.25)
          J.sh.L.rotation.x += Math.sin(t * 19) * 0.7 * f; J.sh.R.rotation.x -= Math.sin(t * 19 + 0.8) * 0.7 * f; J.sh.L.rotation.z += Math.abs(Math.sin(t * 11)) * 0.4 * f; J.sh.R.rotation.z -= Math.abs(Math.sin(t * 11 + 1)) * 0.4 * f
          J.hip.L.rotation.x += Math.sin(t * 15) * 0.6 * f; J.hip.R.rotation.x -= Math.sin(t * 15) * 0.6 * f
          if (drop > 4) { c.root.rotation.z += Math.sin(tt * 4.5) * 0.35 * f; c.root.rotation.x += Math.sin(tt * 3.1 + 1) * 0.25 * f } }   // a long drop tumbles
        else if (m.landed && m.after < 0.6) { const k = 1 - m.after / 0.6; J.sh.L.rotation.z += 0.9 * k; J.sh.R.rotation.z -= 0.9 * k; J.hip.L.rotation.x -= 0.35 * k; J.hip.R.rotation.x -= 0.35 * k }   // arms out, knees soft on landing
      }
      { camera.updateMatrixWorld(true); const vis = cast.filter((c) => c.root.visible), v = new T.Vector3()   // framing: the speaker's face in shot; someone or something in every shot
        for (const c of vis) if (c.talking && !state.insert && !state.allowEmpty) { const h = c.parts.head.getWorldPosition(v).project(camera), top = c.parts.head.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0.75 * c.root.scale.x, 0)).project(camera)
          if (h.z > 1 || Math.abs(h.x) > 0.95 || h.y < -0.8 || h.y > 0.95) state.framing.push(`FRAME: ${c.name} is talking but their face is out of the shot: use d.shot('face' | 'medium', ${c.name})`)
          else if (top.y > 1.05 && h.y > 0.6) state.framing.push(`FRAME: ${c.name}'s head is cut off at the top: use d.shot('medium', ${c.name})`) }
        if (!state.insert && !state.allowEmpty && !vis.some((c) => { const q = c.parts.torso.getWorldPosition(new T.Vector3()).project(camera); return q.z < 1 && Math.abs(q.x) < 1 && Math.abs(q.y) < 1 }))
          state.framing.push(`FRAME: nobody is in this shot: aim at someone (d.shot), or call d.allowEmpty() if the shot is of a thing`) }
      { const on = cast.filter((c) => c.root.visible && !c.airborne && !c.touching && !c.riding && !c.standOn)   // crowd push-apart: bodies that overlap step aside
        for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) { const A = on[i].root.position, B = on[j].root.position, need = 2.3 * (on[i].root.scale.x + on[j].root.scale.x) / 2, dx = B.x - A.x, dz = B.z - A.z, dd = Math.hypot(dx, dz)
          if (dd < need && Math.abs(A.y - B.y) < 2) { const push = (need - dd) / 2, ux = dd ? dx / dd : 1, uz = dd ? dz / dd : 0; A.x -= ux * push; A.z -= uz * push; B.x += ux * push; B.z += uz * push } } }
      for (const [s0, st, du] of state.shakes) { const a = t - s0; if (a >= 0 && a < du) { const k = st * (1 - a / du); camera.position.x += Math.sin(a * 83) * k; camera.position.y += Math.sin(a * 97 + 1) * k * 0.7; camera.position.z += Math.sin(a * 71 + 2) * k * 0.5 } }
      if (env.scene) for (const c of cast) { if (!c.root.visible || c.airborne || c.touching || c.riding) continue
        const p = c.root.position, [nx, nz] = clearSpot(env.scene, p.x, p.y, p.z, c.root.scale.x, c.root.rotation.y)
        if (Math.abs(nx - p.x) + Math.abs(nz - p.z) > 0.01) { p.x = nx; p.z = nz; const k = `moved:${c.name}:${index}`; if (!(state.movedLog ??= {})[k] && !/^npc/.test(c.name)) { state.movedLog[k] = 1; console.log(`MOVED: ${c.name} was inside a prop in line ${index + 1}; moved to a clear spot (${nx.toFixed(1)}, ${nz.toFixed(1)})`) } } } log.push({ kind: 'shot', key: `shot:${index}:${d.n}`, at: lineStart + d.t0, cam: [camera.position.x, camera.position.y, camera.position.z] }); state.issues = state.framing.concat(report(cast.filter((c) => c.root.visible && !c.airborne && !c.standOn), floorY)).concat(vehicleClips(env.scene, cast, camera), propClips(env.scene, cast, camera), onTheSpot(cast, t, `${index}:${d.n}`)); window.FK_ISSUES = state.issues /* every issue (bodies, props, vehicles, walking on the spot, framing) blocks the video */ },
  }
  return d
}

/**
 * The captions of this look, plus the big number and the frame-check banner. Call from overlay(env).
 * 1-2 lowercase words low in the frame, key words (story.json "keys") in yellow.
 */
/** The insert cards of d.insert(): a clock, a phone timer, a note, a sign. A small pop in on the first 0.2 s. */
function drawInsert(ctx, W, H, I) {
  const k = Math.min(1, (I.u ?? 1) / 0.2), sc = 0.92 + 0.08 * k
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2)
  if (I.kind === 'clock') { ctx.fillStyle = '#050505'; ctx.fillRect(-W, -H, 3 * W, 3 * H); ctx.font = `700 ${Math.round(W * 0.3)}px "Courier New", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(255,40,30,0.85)'; ctx.shadowBlur = W * 0.04; ctx.fillStyle = I.color ?? '#ff2a1f'; ctx.fillText(I.text, W / 2, H * 0.45) }
  else if (I.kind === 'phone') { ctx.fillStyle = '#e9edf2'; ctx.fillRect(-W, -H, 3 * W, 3 * H); const w = W * 0.78, h = W * 0.2, x = (W - w) / 2, y = H * 0.4
    ctx.fillStyle = 'rgba(30,40,48,0.92)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, h * 0.25); ctx.fill(); ctx.font = `600 ${Math.round(h * 0.55)}px Montserrat`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = I.color ?? '#7ff0c8'; ctx.fillText(I.text, W / 2, y + h / 2) }
  else if (I.kind === 'note') { ctx.fillStyle = '#3a2614'; ctx.fillRect(-W, -H, 3 * W, 3 * H); const w = W * 0.8, h = H * 0.5, x = (W - w) / 2, y = H * 0.18
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30; ctx.fillStyle = '#f2e6c8'; ctx.fillRect(x, y, w, h); ctx.shadowBlur = 0; ctx.fillStyle = '#2a2016'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    const lines = String(I.text).split('\n'), fs = Math.min(w / 14, h / (lines.length * 1.45)); ctx.font = `${Math.round(fs)}px Georgia, "Times New Roman", serif`; lines.forEach((l, i) => ctx.fillText(l, W / 2, y + h * 0.08 + i * fs * 1.4)) }
  else if (I.kind === 'sign') { ctx.fillStyle = '#e8eef4'; ctx.fillRect(-W, -H, 3 * W, 3 * H); const w = W * 0.84, h = H * 0.36, x = (W - w) / 2, y = H * 0.24
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 6; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); ctx.fillStyle = I.color ?? '#d8322c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const lines = String(I.text).split('\n'), fs = Math.min(w / 9, h / (lines.length * 1.2)); ctx.font = `900 ${Math.round(fs)}px Montserrat`; lines.forEach((l, i) => ctx.fillText(l, W / 2, y + h / 2 + (i - (lines.length - 1) / 2) * fs * 1.15)) }
  ctx.restore()
}
export function captions(env) {
  const { ctx, W, H, raw, words, story, state } = env
  if (state.insert) drawInsert(ctx, W, H, state.insert)
  const edge = (text, x, y, size, fill, lw) => { ctx.font = `700 ${size}px Montserrat`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = size * 0.16; ctx.shadowOffsetY = size * 0.04; ctx.strokeStyle = '#0a0706'; ctx.lineWidth = lw; ctx.strokeText(text, x, y); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.fillStyle = fill; ctx.fillText(text, x, y) }
  ctx.save()
  if (words.length) {
    const keys = new Set((story.keys ?? []).map((w) => w.toLowerCase())), bare = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, '')
    // story.caption (optional): { words: 1-3 per caption, keyColors: ['#ffd21f', ...] (rotates per line), keyCase: 'upper' | 'lower', y: 0.66 }
    const cs = story.caption ?? {}, per = cs.words ?? 2, cols = cs.keyColors ?? ['#ffd21f'], up = cs.keyCase === 'upper', cy = cs.y ?? 0.66
    const chunks = []; let cur = []
    for (const w of words) { cur.push(w); if (cur.length >= per || /[.,!?"]$/.test(w.word)) { chunks.push(cur); cur = [] } }
    if (cur.length) chunks.push(cur)
    let c = chunks[0]; for (const ch of chunks) if (raw >= ch[0].start - 0.05) c = ch
    const parts = c.map((w) => { const key = keys.has(bare(w.word)), t = w.word.replace(/[.,!?"]/g, ''); return { text: key && up ? t.toUpperCase() : t.toLowerCase(), key } })
    const kc = cols[((env.index ?? 0) * 3 + chunks.indexOf(c)) % cols.length]
    ctx.font = '700 84px Montserrat'; const sp = ctx.measureText(' ').width, ws = parts.map((q) => ctx.measureText(q.text).width); let x = W / 2 - (ws.reduce((a, b) => a + b, 0) + sp * (parts.length - 1)) / 2
    parts.forEach((q, i) => { edge(q.text, x + ws[i] / 2, H * cy, 84, q.key ? kc : '#fff', 12); x += ws[i] + sp })
  }
  if (state.big) edge(state.big, W / 2, H * 0.2, 300, '#fff', 30)
  ctx.restore()
  banner(ctx, W, state.issues)
}

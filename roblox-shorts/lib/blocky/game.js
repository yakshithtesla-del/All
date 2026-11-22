// Game logic for story videos, the way a Roblox-style game keeps people out of walls, but deterministic: everything
// here is a pure function of the set and the story time (worked out once, cached), so any frame can be drawn alone.
//   solids:       the set's solid boxes (walls, props, houses, cars), measured once per scene
//   clearSpot:    the nearest spot where a person fits (placing someone inside a prop -> moved out, reported)
//   camClear:     a camera that would sit behind a wall/prop swings round or pulls in in front of it
//   navPath:      a walking route around obstacles (grid + A* + string-pull), sampled by distance
//   groundAt:     the top of whatever is under a point (to land a fall on a car roof, a loaf, a roof)
//   fallMotion / jumpMotion: real arcs (gravity), landing on the true surface, squash + bounces
import { T } from './core.js'

const inside = (o, key) => { for (let p = o; p; p = p.parent) if (p.userData[key]) return p; return null }
const shown = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true }

/** The set's solid boxes, measured once (static world + models). Characters, sky, trees, glass and carried props are not solid. */
export function solids(scene) {
  if (scene.userData.gameSolids) return scene.userData.gameSolids
  scene.updateMatrixWorld(true)
  const list = []
  scene.traverse((o) => {
    if (!o.isMesh || !shown(o) || inside(o, 'castRoot') || inside(o, 'photoTree') || inside(o, 'tree') || inside(o, 'skyDome') || inside(o, 'shell') || inside(o, 'carried')) return
    if (o.material?.transparent && o.material?.depthWrite === false) return
    const b = new T.Box3().setFromObject(o), sz = b.getSize(new T.Vector3())
    if (sz.y < 0.35 || sz.x > 120 || sz.z > 120) return                        // floors, roads and huge backdrops are not obstacles
    list.push(b)
  })
  return (scene.userData.gameSolids = list)
}
const hitsBody = (b, x, z, r, y0, y1) => b.max.y > y0 && b.min.y < y1 && x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z

/** Does a person of size s (studs: radius ~1.1 s, body 0.6..5.3 s above y) fit at x, z? */
export function fits(scene, x, y, z, s = 1) { const r = 0.95 * s; return !solids(scene).some((b) => hitsBody(b, x, z, r, y + 0.6 * s, y + 5.3 * s)) }

/** The nearest spot where a person fits, searching rings outward (the facing direction first). Cached. */
export function clearSpot(scene, x, y, z, s = 1, yaw = 0) {
  const key = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)},${s.toFixed(2)}`, cache = (scene.userData.spotCache ??= {})
  if (key in cache) return cache[key]
  let out = null
  if (fits(scene, x, y, z, s)) out = [x, z]
  else for (let rad = 0.5; rad <= 10 && !out; rad += 0.5) for (let k = 0; k < 16 && !out; k++) {
    const a = yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8), px = x + Math.sin(a) * rad, pz = z + Math.cos(a) * rad
    if (fits(scene, px, y, pz, s)) out = [px, pz]
  }
  return (cache[key] = out ?? [x, z])
}

/** A camera at pos looking at look: if a solid sits between them, swing round the subject (up to 70 degrees) to a clear
 * line, else pull in to just in front of the blocker. Boxes containing the subject are ignored (someone inside a car or room). */
export function camClear(scene, pos, look) {
  const key = `${pos.map((v) => v.toFixed(1))}|${look.map((v) => v.toFixed(1))}`, cache = (scene.userData.camCache ??= {})
  if (key in cache) return cache[key]
  const L = new T.Vector3(...look), boxes = solids(scene).filter((b) => !b.containsPoint(L))
  const blocked = (p) => { const dir = p.clone().sub(L), len = dir.length(); const ray = new T.Ray(L, dir.normalize()); let best = null
    for (const b of boxes) { const h = ray.intersectBox(b, new T.Vector3()); if (h) { const d = h.distanceTo(L); if (d < len - 0.3 && (best === null || d < best)) best = d } } return best }
  const P = new T.Vector3(...pos); let out = pos
  if (blocked(P) !== null) {
    const off = P.clone().sub(L), dist = Math.hypot(off.x, off.z), a0 = Math.atan2(off.x, off.z); let found = null
    // swing round the subject (nearest angle first), then the same a little higher; pulling in is the last resort
    for (const up of [0, 3]) { for (let deg = 15; deg <= 180 && !found; deg += 15) for (const sg of [1, -1]) { const a = a0 + (sg * deg * Math.PI) / 180, q = new T.Vector3(L.x + Math.sin(a) * dist, P.y + up, L.z + Math.cos(a) * dist); if (blocked(q) === null) { found = q; break } } if (found) break }
    if (found) out = [found.x, found.y, found.z]
    else { const d = blocked(P), q = L.clone().add(P.clone().sub(L).normalize().multiplyScalar(Math.max(4, d - 0.6))); out = [q.x, q.y, q.z] }
  }
  return (cache[key] = out)
}

/** A walking route from (x0, z0) to (x1, z1) for a person of size s at floor y: a 1-stud grid around both ends, blocked
 * where a solid meets the body band, 8-way A* that never cuts a corner, then string-pulled to the fewest straight legs.
 * Returns [[x, z], ...] (cached). If no route exists, the straight line. */
export function navPath(scene, x0, z0, x1, z1, s = 1, y = 0) {
  const key = `${[x0, z0, x1, z1, s, y].map((v) => v.toFixed(2))}`, cache = (scene.userData.navCache ??= {})
  if (cache[key]) return cache[key]
  const r = 1.1 * s, pad = 24, minX = Math.min(x0, x1) - pad, minZ = Math.min(z0, z1) - pad, W = Math.ceil(Math.abs(x1 - x0) + 2 * pad), H = Math.ceil(Math.abs(z1 - z0) + 2 * pad)
  const bodies = solids(scene).filter((b) => b.max.y > y + 0.6 * s && b.min.y < y + 5.3 * s)
  const free = new Uint8Array(W * H)
  for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) { const cx = minX + i + 0.5, cz = minZ + j + 0.5; free[i + j * W] = bodies.some((b) => cx + r > b.min.x && cx - r < b.max.x && cz + r > b.min.z && cz - r < b.max.z) ? 0 : 1 }
  const cell = (x, z) => [Math.max(0, Math.min(W - 1, Math.floor(x - minX))), Math.max(0, Math.min(H - 1, Math.floor(z - minZ)))]
  const [si, sj] = cell(x0, z0), [ti, tj] = cell(x1, z1); free[si + sj * W] = 1; free[ti + tj * W] = 1
  const g = new Float32Array(W * H).fill(Infinity), came = new Int32Array(W * H).fill(-1), open = [[0, si + sj * W]]; g[si + sj * W] = 0
  const hx = (i, j) => Math.hypot(i - ti, j - tj)
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]); const [, cur] = open.shift(); if (cur === ti + tj * W) break
    const ci = cur % W, cj = (cur / W) | 0
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H || !free[ni + nj * W]) continue
      if (di && dj && (!free[ni + cj * W] || !free[ci + nj * W])) continue          // never cut a corner past a wall
      const ng = g[cur] + (di && dj ? 1.4142 : 1); if (ng < g[ni + nj * W]) { g[ni + nj * W] = ng; came[ni + nj * W] = cur; open.push([ng + hx(ni, nj), ni + nj * W]) }
    }
  }
  let pts = []
  if (came[ti + tj * W] === -1 && !(si === ti && sj === tj)) pts = [[x0, z0], [x1, z1]]
  else { for (let c = ti + tj * W; c !== -1; c = came[c]) pts.push([minX + (c % W) + 0.5, minZ + ((c / W) | 0) + 0.5]); pts.reverse(); pts[0] = [x0, z0]; pts[pts.length - 1] = [x1, z1] }
  const clear = (a, b) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2); for (let k = 0; k <= n; k++) { const [i, j] = cell(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n); if (!free[i + j * W]) return false } return true }
  const out = [pts[0]]; let i = 0
  while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !clear(pts[i], pts[j])) j--; out.push(pts[j]); i = j }
  return (cache[key] = out)
}
/** A point along a route after `dist` studs, with its heading (radians, 0 = +z) and whether it arrived. */
export function along(route, dist) {
  let left = Math.max(0, dist)
  for (let k = 0; k < route.length - 1; k++) {
    const [ax, az] = route[k], [bx, bz] = route[k + 1], seg = Math.hypot(bx - ax, bz - az)
    if (left <= seg || k === route.length - 2) { const f = seg ? Math.min(1, left / seg) : 1; return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, yaw: Math.atan2(bx - ax, bz - az), done: left >= seg && k === route.length - 2, leg: k } }
    left -= seg
  }
  const [x, z] = route[route.length - 1]; return { x, z, yaw: 0, done: true, leg: 0 }
}

/** The top of whatever stands under (x, z) at or below fromY (a car roof, a loaf, a roof edge); 0 = the ground. */
export function groundAt(scene, x, z, fromY = 1e9) {
  scene.updateMatrixWorld(true)
  const meshes = []; scene.traverse((o) => { if (o.isMesh && shown(o) && !inside(o, 'castRoot') && !inside(o, 'skyDome') && !inside(o, 'photoTree') && !inside(o, 'tree')) meshes.push(o) })
  const hit = new T.Raycaster(new T.Vector3(x, fromY + 0.01, z), new T.Vector3(0, -1, 0)).intersectObjects(meshes, false)[0]
  return hit ? Math.max(0, hit.point.y) : 0
}

/** A fall or a throw as real motion: from (x, y0, z) with speed (vx, vy, vz) at time 0, gravity g (studs/s^2), landing on
 * landY. Then a squash and up to two bounces. Returns { x, y, z, air, squash, landed, after } for time tt (seconds). */
export function ballistic(tt, { x = 0, y0 = 0, z = 0, vx = 0, vy = 0, vz = 0, g = 60, landY = 0, bounce = 0.22 } = {}) {
  // time to land: y0 + vy t - g t^2 / 2 = landY
  const disc = vy * vy + 2 * g * (y0 - landY), tl = disc > 0 ? (vy + Math.sqrt(disc)) / g : 0
  if (tt < tl) return { x: x + vx * tt, y: y0 + vy * tt - (g * tt * tt) / 2, z: z + vz * tt, air: true, squash: 0, landed: false, after: 0 }
  const after = tt - tl, vImpact = Math.min(60, vy - g * tl) * -1, lx = x + vx * tl, lz = z + vz * tl
  const h1 = Math.min(3, ((vImpact * bounce) ** 2) / (2 * g)), t1 = (2 * Math.sqrt(2 * h1 / g)) || 0, h2 = h1 * 0.2, t2 = (2 * Math.sqrt(2 * h2 / g)) || 0
  let y = landY, air = false
  if (after < t1) { const k = after / t1; y = landY + 4 * h1 * k * (1 - k); air = true } else if (after < t1 + t2) { const k = (after - t1) / t2; y = landY + 4 * h2 * k * (1 - k); air = true }
  const squash = after < 0.12 ? Math.sin((after / 0.12) * Math.PI) * Math.min(0.3, vImpact / 120) : 0
  return { x: lx, y, z: lz, air, squash, landed: true, after }
}

// The collision check. Nothing may pass through anything: a scene calls report() every frame with the characters on
// screen; the problems go to window.FK_ISSUES, `render.mjs video` refuses to encode while any frame has one, and stills
// show them as a red banner (window.FK_STILLS). A shot can allow one deliberate contact (a hug, a hand on a shoulder)
// by listing its text in that character's `allow`, e.g. kid.allow = ['kid: armR in mom'].
import { OBB } from 'three/addons/math/OBB.js'
import { T } from './core.js'

const _a = new OBB(), _b = new OBB()
function obb(mesh, shrink, out) { mesh.geometry.computeBoundingBox(); const b = mesh.geometry.boundingBox.clone(); b.expandByScalar(-shrink); out.fromBox3(b); out.applyMatrix4(mesh.matrixWorld); return out }
const hit = (m1, m2, shrink) => m1 && m2 && obb(m1, shrink, _a).intersectsOBB(obb(m2, shrink, _b))
const SELF = [['armL', 'torso'], ['armR', 'torso'], ['handL', 'torso'], ['handR', 'torso'], ['legL', 'legR'], ['armL', 'legL'], ['armR', 'legR'], ['handL', 'legL'], ['handR', 'legR']]
const BODY = ['torso', 'head', 'armL', 'armR', 'handL', 'handR', 'legL', 'legR']

/** Problems for the visible characters standing on a floor at three.js height floorY. Returns strings like "kid: armR in torso". */
export function collisions(chars, floorY) {
  const out = [], vis = chars.filter((c) => c.root.visible)
  for (const c of vis) {
    c.root.updateMatrixWorld(true); const P = c.parts
    for (const [a, b] of SELF) if (hit(P[a], P[b], 0.04)) out.push(`${c.name}: ${a} in ${b}`)
    for (const s of ['soleL', 'soleR']) { const y = new T.Box3().setFromObject(P[s]).min.y
      if (y < floorY - 0.06) out.push(`${c.name}: ${s} under the floor`)
      if (c.standing && !c.airborne && y > floorY + 0.35) out.push(`${c.name}: floating above the floor`) }
  }
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const A = vis[i], B = vis[j]
    for (const pa of BODY) for (const pb of BODY) if (hit(A.parts[pa], B.parts[pb], 0.03)) { out.push(`${A.name}: ${pa} in ${B.name}`); break }
  }
  const allowed = new Set(vis.flatMap((c) => c.allow ?? []))
  return [...new Set(out)].filter((s) => !allowed.has(s))
}
/** Run the check and publish it for render.mjs. Allowances are for this frame only: they are cleared after the check, so set them in the shot's code every frame. */
export function report(chars, floorY) { const issues = collisions(chars, floorY); window.FK_ISSUES = issues; for (const c of chars) c.allow = []; return issues }
/** Red banner listing the problems; drawn only in stills. */
export function banner(ctx, W, issues) {
  if (!window.FK_STILLS || !issues?.length) return
  ctx.save(); ctx.fillStyle = 'rgba(200,0,0,0.85)'; ctx.fillRect(0, 0, W, 40 + 34 * issues.length); ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Arial'
  issues.forEach((s, i) => ctx.fillText('CLIP: ' + s, 20, 44 + i * 34)); ctx.restore()
}

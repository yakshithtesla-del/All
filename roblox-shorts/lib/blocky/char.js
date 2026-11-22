// A blocky avatar with the kit's proportions (rt_engine.Char): head about 2/3 of the torso width, crisp parts,
// sleeves 80 % of the arm then skin, shoes with a sole sticking out forward, a drawn face swapped on the beat.
// Drive it once per frame with .at()/.pose()/.walk()/.run() and .setFace().
import { T, D, rnd } from './core.js'
import { M, box, at, grp } from './materials.js'
import { faceSheet, faceOffset } from './faces.js'

const SIZES = {
  normal: { LW: 0.98, LH: 2.0, TW: 2.0, TD: 1.0, TH: 2.0, AW: 0.98, AH: 2.0, HW: 1.36, HD: 1.3, HH: 1.3 },
  tall: { LW: 0.72, LH: 3.3, TW: 1.7, TD: 0.95, TH: 2.5, AW: 0.62, AH: 3.3, HW: 1.36, HD: 1.3, HH: 1.36 },
}
/**
 * o: { name, shirt, pants, skin?, scale?, tall?, sleeve? (0..1), shoes?, sole?, jacket? (inner shirt rgb),
 *      stripes? (rgb), hair?: 'spiky'|'short'|'long'|'bun'|'bald'|'nightcap'|'copcap', hairRgb?, hair2Rgb?, seed?,
 *      faces?: 'drawn' | 'ink' (the face family this character uses; see faces.js) }
 * Colours are 0-255 rgb. Dark clothes and strong hair colours read best (kit rule).
 */
export function Char(o) {
  const skin = o.skin ?? [232, 190, 160], S = SIZES[o.tall ? 'tall' : 'normal'], { LW, LH, TW, TD, TH, AW, AH, HW, HD, HH } = S, sleeve = o.sleeve ?? 0.8
  const root = new T.Group(); root.scale.setScalar(o.scale ?? 1)
  const body = grp(root, 0, 0, LH)
  const ms = M(o.shirt, { rough: 0.75, tex: 'fabric', rep: [2, 2] }), mp = M(o.pants, { rough: 0.8, tex: 'fabric', rep: [2, 2] }), mk = M(skin, { rough: 0.55 })
  const parts = { torso: at(body, box([TW, TD, TH], ms, 0.05), 0, 0, TH / 2) }
  const neck = grp(body, 0, 0, TH), sheet = faceSheet(skin, { ink: o.faces === 'ink' })
  const fm = new T.MeshStandardMaterial({ map: sheet, roughness: 0.55 })
  const head = at(neck, box([HW, HD, HH], [mk, mk, mk, mk, fm, mk], 0.3), 0, 0, HH / 2 + 0.02); parts.head = head
  const arms = {}, legs = {}
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const a = grp(body, sx * (TW / 2 + AW / 2 + 0.01), 0, TH - 0.3), up = AH * sleeve
    if (up > 0.05) parts['arm' + s] = at(a, box([AW, AW, up], ms, 0.05), 0, 0, 0.3 - up / 2)
    parts['hand' + s] = at(a, box([AW * 0.94, AW * 0.94, AH - up], mk, 0.05), 0, 0, 0.3 - up - (AH - up) / 2); arms[s] = a
    const l = grp(root, sx * (LW / 2 + 0.01), 0, LH); parts['leg' + s] = at(l, box([LW, LW, LH - 0.42], mp, 0.05), 0, 0, -(LH - 0.42) / 2)
    at(l, box([LW + 0.08, LW + 0.36, 0.36], M(o.shoes ?? [238, 238, 242], { rough: 0.5 }), 0.1), 0, -0.14, -LH + 0.3)
    parts['sole' + s] = at(l, box([LW + 0.1, LW + 0.38, 0.12], M(o.sole ?? [40, 40, 46], { rough: 0.6 }), 0.03), 0, -0.14, -LH + 0.07); legs[s] = l
  }
  const C = { name: o.name ?? 'char', root, body, neck, head, arms, legs, parts, sheet, size: S, standing: true, airborne: false, allow: [], lift: 0 }
  /** Stick a coloured block on the torso / head / an arm / the body (stripes, zips, pockets, badges, a tie). loc in the part's kit coords. */
  C.extra = (rgb, size, loc, on = 'torso', { bevel = 0.03, tex = 'fabric' } = {}) => at({ torso: body, head, armL: arms.L, armR: arms.R, body }[on], box(size, M(rgb, { rough: 0.7, tex }), bevel), ...loc)
  if (o.jacket) { C.extra(o.jacket, [TW * 0.3, 0.06, TH * 0.99], [0, -TD / 2 - 0.005, TH / 2], 'torso', { bevel: 0.01 }); for (const sx of [-1, 1]) C.extra([210, 210, 215], [0.05, 0.07, TH * 0.96], [sx * TW * 0.155, -TD / 2 - 0.012, TH / 2], 'torso', { bevel: 0.01, tex: null }) }
  if (o.stripes) for (let i = 0; i < 3; i++) C.extra(o.stripes, [TW + 0.03, TD + 0.03, TH * 0.13], [0, 0, TH * (i + 0.6) / 3.2], 'torso', { bevel: 0.01 })
  if (o.hair) hair(C, o.hair, o.hairRgb ?? [40, 30, 26], o.hair2Rgb, o.seed ?? 1)
  C.setFace = (n) => { C.face = n; sheet.offset.set(...faceOffset(n)) }
  /** Idle life for anyone not acting (call after pose/walk): breathing bob 0.05 on a ~2.6 s cycle, a small head drift. */
  C.idle = (t, amt = 1) => { const ph = t * 2.4 + (o.seed ?? 1) * 1.7; const [y0, ry, rz] = C._rest; body.position.y = y0 + 0.05 * amt * Math.sin(ph); neck.rotation.y = ry + D(5 * amt * Math.sin(ph * 0.37)); neck.rotation.z = rz + D(2.5 * amt * Math.sin(ph * 0.53)) }
  /** Mouth flaps for a quoted line spoken on camera (never under narration): talk / base at 2.5 swaps a second. */
  C.talk = (t, base = 'neutral', rate = 2.5) => C.setFace(Math.floor(t * rate * 2) % 2 ? base : 'talk')
  /** A 0.1 s blink every ~3.5 s on long holds; returns true while blinking. Skip it on a punchline word. */
  C.blink = (t, face) => { const b = ((t + (o.seed ?? 1) * 0.9) % 3.5) < 0.1; C.setFace(b ? 'blink' : face); return b }
  /** head/lean = [nod forward, turn, tilt] in degrees. aL/aR = [swing forward, lift sideways, twist?]. lL/lR = leg swing forward. */
  C.pose = ({ head: h = [0, 0, 0], lean = [0, 0, 0], aL = [0, 0], aR = [0, 0], lL = 0, lR = 0, bob = 0 } = {}) => {
    neck.rotation.set(D(-h[0]), D(h[1]), D(h[2])); body.rotation.set(D(-lean[0]), D(lean[1]), D(lean[2])); body.position.y = LH + bob
    for (const [s, sx, a] of [['L', 1, aL], ['R', -1, aR]]) arms[s].rotation.set(D(-a[0]), D(a[2] ?? 0), D(sx * a[1]))
    legs.L.rotation.x = D(-lL); legs.R.rotation.x = D(-lR); C.lift = 0; C._rest = [body.position.y, neck.rotation.y, neck.rotation.z]
  }
  /** Walk / run cycles. They raise the root a little so the tilted shoes never sink into the floor. */
  C.walk = (ph, amp = 34, arm = 30, head = [0, 0, 0]) => { const s = Math.sin(ph); C.pose({ head, lean: [5, 0, 0], aL: [-arm * s, 4], aR: [arm * s, 4], lL: amp * s, lR: -amp * s }); C.lift = 0.5 * Math.abs(Math.sin(D(amp * s))) }
  C.run = (ph, head = [0, 0, 0]) => { const s = Math.sin(ph); C.pose({ head, lean: [20, 0, 0], aL: [-70 * s, 10], aR: [70 * s, 10], lL: 58 * s, lR: -58 * s, bob: Math.abs(Math.cos(ph)) * 0.3 }); C.lift = 0.5 * Math.abs(Math.sin(D(58 * s))) }
  /** Place the character: kit x/y on the floor at height floorY (three.js y), facing yaw degrees (0 = toward +z / the camera side). */
  C.at = (x, z, floorY, yaw = 0) => { root.position.set(x, floorY + C.lift * root.scale.x, z); root.rotation.set(0, D(yaw), 0) }
  C.pose(); C.setFace('happy'); return C
}

// ---- hair and hats, faceted like the hair meshes in the kit (rt_engine.Char.hair)
function hair(C, style, rgb, rgb2, seed) {
  let s0 = seed * 7919 + C.name.length; const r = () => ((s0 = (s0 * 16807 + 11) % 2147483647) / 2147483647), U = (a, b) => a + (b - a) * r()
  const { HW: W, HD: Dp, HH: H } = C.size, h = C.head, g = new T.Group(); h.add(g)
  const m = M(rgb, { rough: 0.6, tex: 'noise', amt: 0.3, rep: [3, 3] })
  const add = (mesh, mat = m) => { mesh.material = mat; mesh.castShadow = true; g.add(mesh); return mesh }
  const kp = (p) => new T.Vector3(p[0], p[2], -p[1]) // kit -> three
  const spike = (p, d, len, rad, bend = 0) => { const geo = new T.ConeGeometry(rad, len, 4); geo.translate(0, len / 2, 0)
    if (bend) { const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); pa.setZ(i, pa.getZ(i) - bend * (y / len) ** 2 * len) } }
    const s = add(new T.Mesh(geo)); s.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), kp(d).normalize()); s.position.copy(kp(p)) }
  const blob = (r0, p, sc, mat) => { const b = add(new T.Mesh(new T.IcosahedronGeometry(r0, 2)), mat); b.position.copy(kp(p)); b.scale.set(sc[0], sc[2], sc[1]); return b }
  const kbox = (s, p) => { const b = box(s, m, 0.1); at(g, b, ...p); return b }
  const cyl = (rad, len, p, rot = [0, 0, 0], r2, mat = m) => { const c = add(new T.Mesh(new T.CylinderGeometry(r2 ?? rad, rad, len, 18)), mat); const q = new T.Group(); q.position.copy(kp(p)); q.rotation.set(D(rot[0]), D(rot[2]), D(-rot[1])); g.add(q); q.add(c); return c }
  const cap = (drop = 0) => { blob(0.5, [0, 0.16, H * 0.22], [W * 1.12, Dp * 1.04, H * 0.82]); if (drop) kbox([W * 1.06, 0.3, drop], [0, Dp / 2 + 0.04, H * 0.1 - drop / 2]) }
  const crown = (n, lmin, lmax, rad, down = 0) => { for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n + U(-0.2, 0.2), el = U(0.15, 1.2)
    const p = [Math.cos(a) * W * 0.5 * Math.cos(el), Math.sin(a) * Dp * 0.5 * Math.cos(el) + 0.05, H * 0.2 + Math.sin(el) * H * 0.36]; if (p[1] < -Dp * 0.18 && el < 0.95) continue
    spike(p.map((v) => v * 0.9), [Math.cos(a) * Math.cos(el), Math.sin(a) * Math.cos(el) + 0.25, Math.sin(el) * 0.9 - down + U(-0.2, 0.2)], U(lmin, lmax), rad * U(0.8, 1.2), U(-0.15, 0.15)) } }
  const bangs = (n, ln, rad, spread = 1) => { for (let i = 0; i < n; i++) { const u = (i + 0.5) / n - 0.5; spike([u * W * 1.02, -Dp / 2 - 0.1, H / 2 + 0.1], [u * 1.6 * spread + U(-0.2, 0.2), -0.02, -1], Math.min(0.46, ln * U(0.75, 1.1)) * (1 - 0.4 * Math.abs(u)), rad) } }
  const sides = (ln, rad) => { for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) spike([sx * (W / 2 + 0.02), -Dp * 0.3 + k * Dp * 0.3, H * 0.34], [sx * 0.25, -0.05 + 0.1 * k, -1], ln * U(0.8, 1.2), rad) }
  if (style === 'spiky') { cap(); crown(26, 0.5, 0.95, 0.3); bangs(7, 0.46, 0.22); sides(0.7, 0.22) }
  if (style === 'short') { cap(0.5); crown(16, 0.25, 0.45, 0.26, 0.3); bangs(5, 0.36, 0.22, 0.6); sides(0.5, 0.2) }
  if (style === 'bald') { blob(0.5, [0, 0.16, H * 0.02], [W * 1.1, Dp * 1.02, H * 0.5]); crown(10, 0.15, 0.25, 0.2, 0.6) }
  if (style === 'long') { cap(0.6); bangs(6, 0.5, 0.24, 0.8)
    for (let i = 0; i < 9; i++) { const u = i / 8 - 0.5; spike([u * W * 1.1, Dp / 2 + 0.02 - Math.abs(u) * 0.5, H * 0.3], [u * 0.3, 0.12, -1], U(1.9, 2.5), 0.3) }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) spike([sx * (W / 2 + 0.04), -Dp * 0.2 + k * 0.3, H * 0.34], [sx * 0.12, 0.05, -1], U(1.5, 2.0), 0.24) }
  if (style === 'bun') { cap(0.4); bangs(5, 0.4, 0.22, 0.7); sides(0.6, 0.2); blob(0.44, [0, 0.25, H / 2 + 0.34], [1, 1, 1]) }
  if (style === 'nightcap') { const m2 = M(rgb2 ?? [255, 255, 255], { rough: 0.8, tex: 'fabric', rep: [2, 2] })
    cyl(W * 0.57, 0.36, [0, 0, H / 2 + 0.08]); cyl(W * 0.53, 1.8, [0.32, 0.1, H / 2 + 1.02], [8, 22, 0], 0.14)
    const pom = add(new T.Mesh(new T.SphereGeometry(0.27, 20, 12)), m2); pom.position.copy(kp([0.72, 0.22, H / 2 + 1.88])); cyl(W * 0.61, 0.26, [0, 0, H / 2 - 0.02], [0, 0, 0], undefined, m2) }
  if (style === 'copcap') { const m2 = M(rgb2 ?? [250, 210, 60], { rough: 0.3 })
    cyl(W * 0.6, 0.5, [0, 0.02, H / 2 + 0.2]); cyl(W * 0.66, 0.16, [0, 0.02, H / 2 + 0.5]); const v = kbox([W * 0.9, 0.7, 0.1], [0, -Dp / 2 - 0.22, H / 2]); v.rotation.x = D(-10)
    at(g, box([0.34, 0.08, 0.34], m2, 0.05), 0, -W * 0.61, H / 2 + 0.26) }
  return g
}
export { rnd }

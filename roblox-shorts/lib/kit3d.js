// 3D building blocks. Every 3D style exposes the same `kit` (mat, ball, box, cone, cyl, ground),
// so a subject built here picks up the style's look for free.

/** Same mascot as kit2d.drawCharacter, in 3D. Returns a THREE.Group standing on y = 0, ~2 units tall. */
export function makeCharacter(THREE, kit, { body = 'main', skin = 'skin' } = {}) {
  const g = new THREE.Group()
  const torso = kit.box(0.9, 1.0, 0.6, body); torso.position.y = 0.75
  const head = kit.ball(0.42, skin); head.position.y = 1.6
  const eyeL = kit.ball(0.06, 'dark'); eyeL.position.set(-0.14, 1.65, 0.38)
  const eyeR = kit.ball(0.06, 'dark'); eyeR.position.set(0.14, 1.65, 0.38)
  const legL = kit.cyl(0.1, 0.3, 'dark'); legL.position.set(-0.2, 0.12, 0)
  const legR = kit.cyl(0.1, 0.3, 'dark'); legR.position.set(0.2, 0.12, 0)
  const armR = new THREE.Group(); armR.position.set(0.55, 1.15, 0)
  const armMesh = kit.cyl(0.08, 0.6, 'dark'); armMesh.position.y = -0.3; armR.add(armMesh)
  const armL = kit.cyl(0.08, 0.6, 'dark'); armL.position.set(-0.55, 0.85, 0)
  g.add(torso, head, eyeL, eyeR, legL, legR, armL, armR)
  g.userData = { head, armR, torso }
  return g
}

/** Shared kit factory. Styles call this with their own palette + options. */
export function makeKit(THREE, P, { flat = false, detail = 2, roughness = 0.7, segments = 16, material = null } = {}) {
  const cache = new Map()
  const mat = (role) => {
    const key = String(role)
    if (!cache.has(key)) {
      const color = new THREE.Color(P[role] ?? role)
      cache.set(key, material ? material(color) : new THREE.MeshStandardMaterial({ color, flatShading: flat, roughness, metalness: 0 }))
    }
    return cache.get(key)
  }
  const mesh = (geo, role) => { const m = new THREE.Mesh(geo, mat(role)); m.castShadow = true; m.receiveShadow = true; return m }
  return {
    P, mat, mesh,
    ball: (r, role = 'main') => mesh(new THREE.IcosahedronGeometry(r, detail), role),
    box: (w, h, d, role = 'main') => mesh(new THREE.BoxGeometry(w, h, d), role),
    cone: (r, h, role = 'main', seg = flat ? 6 : segments) => mesh(new THREE.ConeGeometry(r, h, seg), role),
    cyl: (r, h, role = 'main', seg = flat ? 7 : segments) => mesh(new THREE.CylinderGeometry(r, r, h, seg), role),
    ground: (size = 60, role = 'ground') => {
      const m = mesh(new THREE.PlaneGeometry(size, size), role)
      m.rotation.x = -Math.PI / 2; m.castShadow = false
      return m
    },
  }
}

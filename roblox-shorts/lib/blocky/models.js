// Real modelled buildings, cars and props from Polyfork, fetched for this story with `node pf.mjs get <id>` (see api.md).
//   create():  await loadModels(['yellow-school-bus-0fd3b6', 'porch-front-cottage-620c29'])
//              const bus = model('yellow-school-bus-0fd3b6'); bus.position.set(9, 0, -20); scene.add(bus)
//              world({ kind: 'suburb', houses: [...ids], cars: [...ids] })   -> the street is built from them
// Models are at real size in metres; model() scales them to studs (a grown-up is ~5 studs, so 1 m = 2.9 studs).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as skinClone } from 'three/addons/utils/SkeletonUtils.js'
import { T } from './core.js'

export const STUDS_PER_M = 2.9
/** Vehicles come at 0.75 of real size so they fit the street: parked at x 5.3 and 15.7, driving down the middle at x 10.5. */
export const VEHICLE_SCALE = 0.75
const CACHE = {}
let INDEX = null
/** Load models fetched into ./models/ (call once in create(), before model() or world()). */
export async function loadModels(ids, base = '/models/') {
  INDEX ??= await fetch(base + 'index.json').then((r) => r.json()).catch(() => ({}))
  const L = new GLTFLoader()
  await Promise.all(ids.filter((id) => !CACHE[id]).map(async (id) => {
    const g = (await L.loadAsync(`${base}${id}.glb`)).scene
    g.traverse((o) => {
      if (!o.isMesh) return
      const m = o.material, vc = !!o.geometry.attributes.color
      // matte, like the shorts: flat-shaded vertex colours, no shine and no mirror reflections
      o.material = new T.MeshStandardMaterial({ color: vc ? '#ffffff' : m.color, vertexColors: vc, map: m.map ?? null, roughness: 0.82, metalness: 0, flatShading: true, transparent: m.transparent, opacity: m.opacity, side: m.side })
      o.castShadow = o.receiveShadow = true; o.userData.tex = 'none'
    })
    g.traverse((o) => { if (o.isSkinnedMesh) g.userData.skinned = true }) // animals: a plain clone stays bound to the first copy's bones
    CACHE[id] = g
  }))
}
/** Info about a loaded model: { title, class, size_m, rigged, night, describe } (from models/index.json). */
export const modelInfo = (id) => INDEX?.[id] ?? {}
/**
 * A copy of a loaded model, at our scale, standing on y 0, front toward +z. opts: { height (studs, instead of real
 * size), scale (extra factor; vehicles default to VEHICLE_SCALE), night (true: its lights glow) }. Vehicles are marked for the frame check.
 * m.userData.part(name, value): turn or slide a moving part (a door, a wheel; names in modelInfo(id).rigged).
 */
export function model(id, { height, scale, night = false } = {}) {
  scale ??= modelInfo(id).class === 'vehicle' ? VEHICLE_SCALE : 1
  const src = CACHE[id]; if (!src) throw new Error(`model: "${id}" is not loaded. Run node pf.mjs get ${id}, then await loadModels(['${id}']) in create().`)
  const info = modelInfo(id), g = src.userData.skinned ? skinClone(src) : src.clone(true), k = height ? height / (info.size_m?.y ?? new T.Box3().setFromObject(src).getSize(new T.Vector3()).y) : STUDS_PER_M * scale
  const root = new T.Group(); g.scale.setScalar(k); root.add(g)
  if (info.class === 'vehicle') root.userData.vehicle = info.title ?? id
  if (night && info.night) glow(g, info.night)
  const rig = info.rigged ?? {}
  root.userData.part = (name, v) => { const p = g.getObjectByName(name), r = rig[name]; if (!p || !r) return; const ax = r.axis ?? 'y'; if (r.slide) p.position[ax] = v; else p.rotation[ax] = (v * Math.PI) / 180 }
  root.userData.model = id
  ;(globalThis.FK_MODELS ??= new Set()).add(id) // render.mjs checks the story's place plan against what was really built
  return root
}
/** Night: the zones Polyfork lists (windows, lamps, tail lights) glow, found by their exact vertex colour. */
function glow(g, zones) {
  const want = Object.values(zones).filter((z) => z.albedo).map((z) => ({ c: new T.Color(z.albedo), e: new T.Color(z.color), k: z.intensity ?? 1 }))
  if (!want.length) return
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.color) return
    const col = o.geometry.attributes.color, n = col.count, em = new Float32Array(n * 3); let any = false
    for (let i = 0; i < n; i++) { const c = new T.Color(col.getX(i), col.getY(i), col.getZ(i)).convertLinearToSRGB(); for (const w of want) if (Math.abs(c.r - w.c.r) + Math.abs(c.g - w.c.g) + Math.abs(c.b - w.c.b) < 0.04) { em[i * 3] = w.e.r * w.k; em[i * 3 + 1] = w.e.g * w.k; em[i * 3 + 2] = w.e.b * w.k; any = true } }
    if (!any) return
    o.geometry = o.geometry.clone(); o.geometry.setAttribute('emissiveColor', new T.BufferAttribute(em, 3))
    const m = o.material.clone(); m.emissive = new T.Color('#ffffff'); m.onBeforeCompile = (s) => { s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 emissiveColor;\nvarying vec3 vEm;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEm = emissiveColor;'); s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vEm;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = vEm * 2.0;') }; o.material = m
  })
}

/** roofAt(house, x, z): the height (studs) of the model's surface right above world x, z: where its roof really is, to
 * stand someone on it or hang them from the gutter. null if the ray misses the model. */
export function roofAt(m, x, z) {
  m.updateMatrixWorld(true); const ray = new T.Raycaster(new T.Vector3(x, 500, z), new T.Vector3(0, -1, 0)); const hit = ray.intersectObject(m, true)[0]
  return hit ? hit.point.y : null
}

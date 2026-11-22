// Camera grammar of the reference look (pack v3 look-reference.md): close and low, wide lens feel, push-ins on ~40 %
// of shots, shake on impacts / runs / power moments, a roll on hits, soft background on close-ups (depth of field).
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { T, D } from './core.js'

/** Vertical field of view (camera.fov) per shot size: close-up, medium, wide. Never 70 on a close-up (bends blocky heads). */
export const LENS = { cu: 35, ms: 48, ws: 62 }

/**
 * The close-up: the camera straight in front of a character's face, a little below the eyes, looking up a touch.
 * fill = share of the frame width the head fills (0.5-0.7 for a close-up, 0.3-0.4 medium close).
 * side moves the camera to the character's left (+) or right (-) in units; turn swings it around the face in degrees.
 * Returns the distance from the camera to the face (use it as the focus distance).
 */
export function faceCam(camera, C, { fill = 0.55, fov = LENS.cu, height = -0.35, side = 0, turn = 0, look = [0, -0.1, 0] } = {}) {
  C.root.updateMatrixWorld(true)
  const head = C.head.getWorldPosition(new T.Vector3()), s = C.root.scale.x, yaw = C.root.rotation.y + D(turn)
  const fwd = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), right = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
  const dist = (C.size.HW * s / fill) * (16 / 9) / (2 * Math.tan(D(fov / 2))) + C.size.HD * s / 2
  camera.fov = fov; camera.near = 0.1; camera.far = 600; camera.updateProjectionMatrix()
  camera.position.copy(head).addScaledVector(fwd, dist).addScaledVector(right, side).add(new T.Vector3(0, height * s, 0))
  camera.lookAt(head.x + look[0], head.y + look[1] * s, head.z + look[2])
  return dist
}

const n3 = (t, a, b, c) => (Math.sin(t * a) + 0.6 * Math.sin(t * b + 1.3) + 0.35 * Math.sin(t * c + 2.1)) / 1.95
/** Screen shake: call after the camera is placed and aimed. amt 1 = a run, 2-3 = an impact (let it decay with the shot time). */
export function shake(camera, t, amt = 1) {
  camera.rotateX(D(0.7 * amt * n3(t, 31, 47, 73))); camera.rotateY(D(0.7 * amt * n3(t, 37, 53, 61))); camera.rotateZ(D(0.35 * amt * n3(t, 29, 43, 67)))
}
/** A roll on a hit or a fall: deg of dutch tilt (≤5, never two shots in a row). */
export const roll = (camera, deg) => camera.rotateZ(D(deg))

let CMP = null
/**
 * Render the shot. dof = the focus distance in units (faceCam returns it) for a soft background on close-ups, or null
 * for a sharp frame (wides, inserts, signs). Tone mapping and exposure come from the renderer as usual.
 */
export function renderShot(renderer, scene, camera, { dof = null, blur = 0.01, aperture = 0.0014 } = {}) {
  if (!scene.userData.sheen) { scene.userData.sheen = true; const pm = new T.PMREMGenerator(renderer), sky = globalThis.FK_SKY; let photo = false; scene.traverse((o) => { if (o.userData.photoSky) photo = true }); scene.environment = photo && sky ? pm.fromEquirectangular(sky).texture : pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = photo ? 0.3 : 0; if (photo && sky) { scene.background = sky; scene.backgroundIntensity = 0.85; scene.traverse((o) => { if (o.userData.skyDome) o.visible = false }) } pm.dispose() } /* by day the photo sky's light fills the shadows (matte surfaces: soft fill, no mirror reflections) */ // soft reflections: plastic looks moulded, not painted
  if (dof == null) { renderer.render(scene, camera); return }
  const size = renderer.getDrawingBufferSize(new T.Vector2())
  if (!CMP || CMP.renderer !== renderer) {
    const c = new EffectComposer(renderer), rp = new RenderPass(scene, camera), bp = new BokehPass(scene, camera, { focus: dof, aperture, maxblur: blur })
    c.addPass(rp); c.addPass(bp); c.addPass(new OutputPass()); CMP = { c, rp, bp, renderer, w: 0, h: 0 }
  }
  if (CMP.w !== size.x || CMP.h !== size.y) { CMP.c.setPixelRatio(1); CMP.c.setSize(size.x, size.y); CMP.w = size.x; CMP.h = size.y }
  CMP.rp.scene = CMP.bp.scene = scene; CMP.rp.camera = CMP.bp.camera = camera
  const u = CMP.bp.uniforms; u.focus.value = dof; u.aperture.value = aperture; u.maxblur.value = blur; u.nearClip.value = camera.near; u.farClip.value = camera.far; u.aspect.value = size.x / size.y
  CMP.c.render()
}

// One-shot effects that fire on a word: sparkles, puffs, debris, music notes, feathers, confetti. Each burst is a pure
// function of its age (time since it fired) and a seed, so any frame can be drawn alone. A small pool of sprites and
// blocks lives in the scene; direct() hides them every frame and d.burst() shows the ones a burst needs.
import { T } from './core.js'

const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t }
let TEX = null
function textures() {
  if (TEX) return TEX
  TEX = {
    sparkle: tex(128, 128, (g, w) => { g.translate(w / 2, w / 2); const grd = g.createRadialGradient(0, 0, 0, 0, 0, 60); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grd; g.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? 9 : 62, a = (k * Math.PI) / 4; g.lineTo(Math.sin(a) * r, -Math.cos(a) * r) } g.closePath(); g.fill() }),     // a 4-point star
    puff: tex(128, 128, (g, w) => { const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62); grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.6, 'rgba(240,240,240,0.55)'); grd.addColorStop(1, 'rgba(230,230,230,0)'); g.fillStyle = grd; g.fillRect(0, 0, w, w) }),
    note: tex(128, 128, (g) => { g.fillStyle = '#1b1b22'; g.font = 'bold 104px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♪', 64, 70) }),
    feather: tex(64, 160, (g) => { g.fillStyle = '#ffe27a'; g.beginPath(); g.ellipse(32, 80, 22, 74, 0, 0, 7); g.fill(); g.strokeStyle = '#d9a514'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 8); g.lineTo(32, 156); g.stroke() }),
    dot: tex(32, 32, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 32, 32) }),
  }
  return TEX
}
const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return Math.abs(h) || 1 }

function pool(scene) {
  if (scene.userData.burstPool) return scene.userData.burstPool
  const P = { sprites: [], blocks: [], used: 0, usedB: 0 }
  for (let i = 0; i < 160; i++) { const s = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthWrite: false })); s.visible = false; s.userData.carried = true; s.renderOrder = 5; scene.add(s); P.sprites.push(s) }
  for (let i = 0; i < 40; i++) { const b = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ roughness: 0.8 })); b.castShadow = true; b.visible = false; b.userData.carried = true; scene.add(b); P.blocks.push(b) }
  return (scene.userData.burstPool = P)
}
/** Hide every burst piece; direct() calls this at the start of each frame. */
export function resetBursts(scene) { const P = scene?.userData.burstPool; if (!P) return; for (const s of P.sprites) s.visible = false; for (const b of P.blocks) b.visible = false; P.used = 0; P.usedB = 0 }

const KINDS = {
  // [life (s), count, sprite texture | 'block']
  sparkle: { life: 0.9, n: 14, tex: 'sparkle' },
  puff: { life: 0.8, n: 10, tex: 'puff' },
  notes: { life: 1.6, n: 4, tex: 'note' },
  feathers: { life: 2.2, n: 8, tex: 'feather' },
  confetti: { life: 1.8, n: 30, tex: 'dot' },
  debris: { life: 1.4, n: 10, tex: 'block' },
}
/**
 * Show a burst of `kind` at world [x, y, z], `age` seconds after it fired (draw nothing before it fires or after it ends).
 * opts: { n, size (studs), color, spread (studs), seed, g (gravity for debris), floor (y the debris lands on) }.
 */
export function burstAt(scene, kind, age, [x, y, z], o = {}) {
  const K = KINDS[kind]; if (!K) throw new Error(`burst: unknown kind "${kind}". Use ${Object.keys(KINDS).join(', ')}.`)
  if (age < 0 || age > (o.life ?? K.life)) return
  const P = pool(scene), T_ = textures(), base = o.seed ?? hash(kind + x.toFixed(1) + z.toFixed(1)), n = o.n ?? K.n, life = o.life ?? K.life, k = age / life, size = o.size ?? 1, spread = o.spread ?? 1.6
  for (let i = 0; i < n; i++) {
    const r = rnd(base + i * 7919)   // each particle its own seeded numbers: no flicker
    const a = r() * Math.PI * 2, e = r() * 0.9 + 0.1, sp = (0.6 + r()) * spread, delay = r() * life * 0.25, ai = Math.max(0, age - delay), ki = Math.min(1, ai / (life - delay))
    if (age < delay) continue
    if (K.tex === 'block') {
      if (P.usedB >= P.blocks.length) break; const b = P.blocks[P.usedB++], g = o.g ?? 40, vx = Math.cos(a) * sp * 4, vz = Math.sin(a) * sp * 4, vy = 6 + e * 10
      const yy = Math.max(o.floor ?? 0, y + vy * ai - (g * ai * ai) / 2) + 0.15 * size
      b.visible = true; b.position.set(x + vx * ai, yy, z + vz * ai); b.scale.setScalar(size * (0.25 + 0.3 * r())); b.rotation.set(ai * (3 + 6 * e), ai * 4 * e, ai * 2); b.material.color.set(o.color ?? (i % 2 ? '#8a8f99' : '#b5a48a')); continue
    }
    if (P.used >= P.sprites.length) break
    const s = P.sprites[P.used++], m = s.material; m.map = T_[K.tex]; m.color.set(o.color ?? (kind === 'confetti' ? ['#ff4f7a', '#ffd23f', '#3fb6e8', '#5ad16b', '#b06bff'][i % 5] : '#ffffff')); m.blending = kind === 'sparkle' ? T.AdditiveBlending : T.NormalBlending; m.needsUpdate = true
    let px = x, py = y, pz = z, sc = size, op = 1
    if (kind === 'sparkle') { px += Math.cos(a) * sp * ki; pz += Math.sin(a) * sp * ki; py += (r() - 0.3) * spread * 1.2 * ki + ki * 0.6; sc = size * (0.35 + 0.5 * e) * Math.sin(Math.PI * Math.min(1, ki * 1.15)); op = 1 }
    else if (kind === 'puff') { px += Math.cos(a) * sp * 0.6 * Math.sqrt(ki); pz += Math.sin(a) * sp * 0.6 * Math.sqrt(ki); py += ki * 1.2 * e; sc = size * (0.8 + 1.6 * ki); op = (1 - ki) * 0.85 }
    else if (kind === 'notes') { px += Math.sin(ai * 3 + i) * 0.5 + (i - 1.5) * 0.6; py += ki * 3 + 0.5; sc = size * 0.7; op = 1 - ki * ki }
    else if (kind === 'feathers') { px += Math.cos(a) * sp * 0.8 + Math.sin(ai * 2.4 + i) * 0.7; pz += Math.sin(a) * sp * 0.8; py += 1.2 - ki * 3.2; sc = size * 0.6; op = 1 - Math.max(0, ki - 0.7) / 0.3; m.rotation = Math.sin(ai * 3 + i) * 0.8 }
    else if (kind === 'confetti') { const g = 8; px += Math.cos(a) * sp * 2 * ki; pz += Math.sin(a) * sp * 2 * ki; py += (5 + e * 4) * ai - (g * ai * ai) / 2; py = Math.max(o.floor ?? 0, py); sc = size * 0.18; m.rotation = ai * 8 * e; op = 1 - Math.max(0, ki - 0.8) / 0.2 }
    s.visible = sc > 0.01 && op > 0.01; s.position.set(px, py, pz); s.scale.set(sc, kind === 'feathers' ? sc * 2.4 : sc, 1); m.opacity = Math.max(0, op)
  }
}

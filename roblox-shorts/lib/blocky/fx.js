// Effects from the viral shorts (videos/reference/BLOCKY-STORIES-ANALYSIS-2.md): the counter badge over a head, the whip
// pan, particles (snow, Zzz, tears, smoke, sparkles), bokeh, and the phone livestream frame.
//   3D, in create():   const z = particles('zzz'); scene.add(z)        -> moves by itself every frame (direct() ticks it)
//   update():          d.badge(c, 'NO', 7)  d.whip(1)                 -> drawn by captions(env)
//   overlay():         bokeh(env)  livestream(env, {...})
import { T, cl } from './core.js'

// ---------------------------------------------------------------- particles (3D)
const LIVE = new Set()
/** Moves every particle system made with particles(); direct() calls it once per frame. Snow follows the camera. */
export function tickFx(t, camera) { for (const p of LIVE) { if (!p.parent) continue; p.userData.tick(t, camera) } }
const sprite = (draw, size = 128) => { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t }
const soft = (rgba) => sprite((g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, rgba(1)); gr.addColorStop(0.45, rgba(0.55)); gr.addColorStop(1, rgba(0)); g.fillStyle = gr; g.fillRect(0, 0, s, s) })
const rnd = (seed) => { let s = seed * 9301 + 49297; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }

/**
 * A particle effect. Put it where it belongs with .position (a head for zzz/tears, the floor for smoke) and add it to
 * the scene; hide it with .visible = false. kind:
 *   'snow'    falling snow around the camera (wherever the camera is). opts.n (default 600), opts.area (studs, 40)
 *   'zzz'     three Z letters rising and fading over a sleeper's head
 *   'tears'   two streams of blue drops falling from the eyes (put it at the face: head height, in front of the face)
 *   'smoke'   a swirling purple-black cloud (a nightmare, a curse). opts.color, opts.size (studs, 3)
 *   'sparkle' twinkling white-blue stars (magic, something being eaten, a wish). opts.color, opts.size (2)
 *   'dust'    floating warm specks in the light (a cosy or eerie room)
 */
export function particles(kind, opts = {}) {
  const g = new T.Group(), r = rnd(opts.seed ?? 3); g.userData.fx = kind
  if (kind === 'snow') {
    const n = opts.n ?? 600, A = opts.area ?? 40, pos = new Float32Array(n * 3), seeds = []
    for (let i = 0; i < n; i++) seeds.push([r() * A - A / 2, r() * 24, r() * A - A / 2, 1 + r() * 1.5, r() * 6])
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3))
    const pts = new T.Points(geo, new T.PointsMaterial({ map: soft((a) => `rgba(255,255,255,${a})`), size: opts.size ?? 0.32, transparent: true, depthWrite: false, fog: false })); pts.frustumCulled = false; g.add(pts)
    g.userData.tick = (t, cam) => { if (cam) g.position.set(cam.position.x, 0, cam.position.z); seeds.forEach(([x, y, z, v, ph], i) => { pos[i * 3] = x + Math.sin(t * 0.6 + ph) * 0.7; pos[i * 3 + 1] = ((y - t * v) % 24 + 24) % 24 - 2; pos[i * 3 + 2] = z }); geo.attributes.position.needsUpdate = true }
  } else if (kind === 'zzz') {
    const tex = sprite((c, s) => { c.font = `900 ${s * 0.8}px "Arial Black", Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = s * 0.08; c.strokeStyle = '#1a2040'; c.strokeText('Z', s / 2, s / 2); c.fillStyle = '#ffffff'; c.fillText('Z', s / 2, s / 2) })
    const zs = [0, 1, 2].map(() => { const m = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); g.add(m); return m })
    g.userData.tick = (t) => zs.forEach((m, i) => { const k = ((t * 0.55 + i / 3) % 1); m.position.set(0.5 + k * 1.2 + Math.sin(t * 2 + i) * 0.15, k * 2.6, 0); const s = 0.45 + k * 0.6; m.scale.set(s, s, 1); m.material.opacity = Math.sin(k * Math.PI) })
  } else if (kind === 'tears') {
    const tex = soft((a) => `rgba(90,190,255,${a})`), drops = []
    for (let i = 0; i < 16; i++) { const m = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); g.add(m); drops.push([m, i % 2 ? 0.38 : -0.38, r()]) }
    g.userData.tick = (t) => drops.forEach(([m, x, ph]) => { const k = (t * 1.3 + ph) % 1; m.position.set(x + Math.sin(ph * 9) * 0.06, -k * 1.8, 0.05); const s = 0.22 * (1 - k * 0.4); m.scale.set(s, s * 1.3, 1); m.material.opacity = 1 - k })
  } else if (kind === 'smoke') {
    const col = new T.Color(opts.color ?? '#3a1660'), S = opts.size ?? 3, puffs = []
    const tex = soft((a) => `rgba(255,255,255,${a})`)
    for (let i = 0; i < 26; i++) { const m = new T.Sprite(new T.SpriteMaterial({ map: tex, color: col.clone().multiplyScalar(0.5 + r() * 0.7), transparent: true, depthWrite: false })); g.add(m); puffs.push([m, r() * 6.28, 0.3 + r() * 0.7, r()]) }
    // two glowing eyes inside the cloud
    const eye = soft((a) => `rgba(255,70,140,${a})`), eyes = [-0.35, 0.35].map((x) => { const m = new T.Sprite(new T.SpriteMaterial({ map: eye, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); m.position.set(x * S * 0.4, S * 0.35, S * 0.3); m.scale.set(S * 0.18, S * 0.12, 1); g.add(m); return m })
    eyes.forEach((e) => (e.visible = opts.eyes !== false))
    g.userData.tick = (t) => puffs.forEach(([m, a, rad, ph]) => { const ang = a + t * (0.6 + ph); m.position.set(Math.cos(ang) * rad * S * 0.5, S * 0.3 + Math.sin(t * 1.3 + ph * 6) * S * 0.18, Math.sin(ang) * rad * S * 0.35); const s = S * (0.55 + 0.25 * Math.sin(t * 2 + ph * 5)); m.scale.set(s, s, 1); m.material.opacity = 0.75 })
  } else if (kind === 'sparkle' || kind === 'dust') {
    const sp = kind === 'sparkle', col = opts.color ?? (sp ? '#bfe8ff' : '#ffd9a0'), S = opts.size ?? (sp ? 2 : 6), N = sp ? 30 : 60
    const tex = sp ? sprite((c, s) => { c.fillStyle = '#fff'; c.translate(s / 2, s / 2); for (let k = 0; k < 2; k++) { c.beginPath(); c.moveTo(0, -s / 2); c.quadraticCurveTo(0, 0, s / 2, 0); c.quadraticCurveTo(0, 0, 0, s / 2); c.quadraticCurveTo(0, 0, -s / 2, 0); c.quadraticCurveTo(0, 0, 0, -s / 2); c.fill(); c.rotate(Math.PI / 4); c.scale(0.55, 0.55) } }) : soft((a) => `rgba(255,255,255,${a})`)
    const ps = []; for (let i = 0; i < N; i++) { const m = new T.Sprite(new T.SpriteMaterial({ map: tex, color: col, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); g.add(m); ps.push([m, (r() - 0.5) * S, r() * S, (r() - 0.5) * S, r()]) }
    g.userData.tick = (t) => ps.forEach(([m, x, y, z, ph]) => { const k = sp ? 0.5 + 0.5 * Math.sin(t * 7 + ph * 30) : 0.6; m.position.set(x + Math.sin(t * 0.7 + ph * 9) * 0.3, (y + t * (sp ? 0.8 : 0.15)) % S, z); const s = (sp ? 0.35 : 0.08) * (0.4 + k); m.scale.set(s, s, 1); m.material.opacity = sp ? k : 0.5 })
  } else throw new Error(`particles: unknown kind "${kind}". Use snow, zzz, tears, smoke, sparkle or dust.`)
  g.userData.tick(0); LIVE.add(g); return g
}

// ---------------------------------------------------------------- overlays (2D, drawn by captions() or the scene)
const pill = (ctx, x, y, w, h, fill) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fillStyle = fill; ctx.fill() }
/**
 * The counter badges set with d.badge(): a pill over a head, "NO | 7" style. The label sits in a coloured capsule (red,
 * or yellow while the count is high), the number on dark glass. When the number changes the badge pops.
 */
export function drawBadges(env) {
  const { ctx, W, H, camera, state } = env; if (!state.badges?.length || !camera) return
  const v = new T.Vector3()
  for (const b of state.badges) {
    const c = b.c, s = c.root.scale.x; v.set(c.root.position.x, c.root.position.y + (b.y ?? 6.4) * s, c.root.position.z).project(camera)
    if (v.z > 1) continue
    const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H, pop = 1 + 0.35 * Math.sin(cl(b.since / 0.25) * Math.PI) * (b.since < 0.25 ? 1 : 0)
    const size = (b.size ?? 1) * W * 0.075 * pop, hgt = size, lw = size * 1.45, nw = size * 1.2, x0 = x - (lw + nw) / 2, y0 = Math.max(H * 0.04, y - hgt)
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = size * 0.25
    pill(ctx, x0, y0, lw + nw, hgt, 'rgba(20,22,30,0.82)'); ctx.shadowBlur = 0
    pill(ctx, x0 + size * 0.08, y0 + size * 0.08, lw - size * 0.06, hgt - size * 0.16, b.color ?? (b.n >= (b.warn ?? 1) ? '#f5c21b' : '#e8343a'))
    ctx.font = `800 ${size * 0.58}px Montserrat, Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'
    ctx.fillText(b.label, x0 + lw / 2 + size * 0.02, y0 + hgt * 0.53); ctx.fillText(String(b.n), x0 + lw + nw / 2 - size * 0.06, y0 + hgt * 0.53)
    ctx.restore()
  }
}
/** A whip pan's smear: the frame streaks sideways in the first `dur` seconds after the cut (state.whip from d.whip()). */
export function drawWhip(env) {
  const { ctx, W, H, state } = env, w = state.whip; if (!w) return
  const k = 1 - cl(w.u / w.dur); if (k <= 0) return
  const c = (drawWhip.c ??= document.createElement('canvas')); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(ctx.canvas, 0, 0)
  const len = W * 0.22 * k * k, N = 10
  ctx.save(); for (let i = 1; i <= N; i++) { ctx.globalAlpha = 0.22; ctx.drawImage(c, w.dir * len * (i / N), 0) } ctx.restore()
}
/** Soft out-of-focus light circles drifting over the frame (warm lamps at night, a dreamy memory). Call in overlay after grade(). */
export function bokeh(env, { n = 14, color = '255,200,120', strength = 0.5, seed = 5 } = {}) {
  const { ctx, W, H, globalT: t } = env, r = rnd(seed)
  ctx.save(); ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < n; i++) { const x = (r() * W + Math.sin(t * 0.2 + i) * W * 0.03), y = r() * H * 0.7 + Math.cos(t * 0.15 + i) * H * 0.02, rad = W * (0.03 + r() * 0.07), a = strength * (0.12 + r() * 0.18)
    const gr = ctx.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${color},${a})`); gr.addColorStop(0.7, `rgba(${color},${a * 0.7})`); gr.addColorStop(1, `rgba(${color},0)`); ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2) }
  ctx.restore()
}
/**
 * A phone livestream frame over the shot (someone films it and the chat goes wild). Call in overlay() after grade().
 * opts: { name ('the streamer'), viewers (8400), comments: [['user', 'text'], ...] (scroll up one per 0.6 s), start (seconds into the line when it begins) }
 */
export function livestream(env, { name = 'live', viewers = 8400, comments = [], start = 0 } = {}) {
  const { ctx, W, H, raw } = env, t = Math.max(0, raw - start), s = W / 1080
  ctx.save(); ctx.font = `700 ${30 * s}px Montserrat, Arial`; ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, 170 * s); const gr = ctx.createLinearGradient(0, H * 0.55, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)'); ctx.fillStyle = gr; ctx.fillRect(0, H * 0.55, W, H * 0.45)
  ctx.beginPath(); ctx.arc(70 * s, 70 * s, 34 * s, 0, 7); ctx.fillStyle = '#8a9cc0'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(name, 120 * s, 58 * s); ctx.font = `600 ${22 * s}px Montserrat, Arial`; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(`${(viewers / 1000).toFixed(1)}K followers`, 120 * s, 92 * s)
  pill(ctx, 40 * s, 120 * s, 96 * s, 40 * s, '#ff2d55'); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `800 ${22 * s}px Montserrat, Arial`; ctx.fillText('LIVE', 88 * s, 141 * s)
  pill(ctx, 146 * s, 120 * s, 150 * s, 40 * s, 'rgba(0,0,0,0.45)'); ctx.fillStyle = '#fff'; ctx.fillText(`👁 ${Math.round(viewers * (1 + t * 0.08)).toLocaleString('en')}`, 221 * s, 141 * s)
  ctx.font = `700 ${40 * s}px Arial`; ctx.fillText('✕', W - 60 * s, 70 * s)
  const shown = Math.min(comments.length, Math.floor(t / 0.6) + 1), ROW = 64 * s
  ctx.textAlign = 'left'
  for (let i = 0; i < Math.min(6, shown); i++) { const [u, msg] = comments[shown - 1 - i], y = H * 0.9 - i * ROW, a = 1 - i * 0.12; ctx.globalAlpha = a; ctx.font = `700 ${26 * s}px Montserrat, Arial`; ctx.fillStyle = '#ffd94a'; ctx.fillText(u, 40 * s, y); const uw = ctx.measureText(u + '  ').width; ctx.font = `600 ${26 * s}px Montserrat, Arial`; ctx.fillStyle = '#fff'; ctx.fillText(msg, 40 * s + uw, y) }
  ctx.globalAlpha = 1
  for (let i = 0; i < 7; i++) { const k = ((t * 0.6 + i / 7) % 1), x = W - (90 + Math.sin(i * 3 + t * 2) * 30) * s, y = H * (0.88 - k * 0.35); ctx.globalAlpha = 1 - k; ctx.font = `${44 * s}px Arial`; ctx.textAlign = 'center'; ctx.fillStyle = ['#ff3b5c', '#ffd23f', '#ffffff'][i % 3]; ctx.fillText(['♥', '★', '♥', '!', '♥', '?', '★'][i], x, y) }
  ctx.restore()
}

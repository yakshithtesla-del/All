// Drawing on paper (the "anything you draw becomes real" shot): an open spiral sketchbook and a yellow pencil; the line
// draws itself stroke by stroke as k goes 0 -> 1, the pencil tip on the end of the line. Strokes are lists of [x, y] in
// page units (0..1, 0,0 = top-left). Doodles are crude on purpose, like a kid's drawing.
import { T } from './core.js'
import { box } from './direct.js'

/** A sketchbook lying on y = 0 (put it on a desk), page W x H studs, front toward +z. Returns the group; draw with drawOn(). */
export function sketchbook({ w = 6, h = 8, cover = '#d8433b' } = {}) {
  const g = new T.Group(); box(g, w + 0.5, 0.12, h + 0.4, cover, 0, 0.06, 0)
  const c = document.createElement('canvas'); c.width = 768; c.height = Math.round(768 * h / w)
  const texr = new T.CanvasTexture(c); texr.colorSpace = T.SRGBColorSpace; texr.anisotropy = 4
  const page = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map: texr, roughness: 0.9 })); page.rotation.x = -Math.PI / 2; page.position.y = 0.14; page.receiveShadow = true; g.add(page)
  for (let i = 0; i < 9; i++) { const r = new T.Mesh(new T.TorusGeometry(0.22, 0.05, 6, 14), new T.MeshStandardMaterial({ color: '#9aa0a8', metalness: 0.6, roughness: 0.4 })); r.rotation.y = Math.PI / 2; r.position.set(-w / 2 + 0.1, 0.2, -h / 2 + 0.6 + i * (h - 1.2) / 8); g.add(r) }
  const pencil = new T.Group(); const body = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 3.4, 6), new T.MeshStandardMaterial({ color: '#f2c230', roughness: 0.6 })); body.position.y = 1.9; pencil.add(body)
  const wood = new T.Mesh(new T.ConeGeometry(0.16, 0.36, 6), new T.MeshStandardMaterial({ color: '#e8c79a' })); wood.rotation.x = Math.PI; wood.position.y = 0.06 + 0.18; pencil.add(wood)
  const lead = new T.Mesh(new T.ConeGeometry(0.06, 0.12, 6), new T.MeshStandardMaterial({ color: '#222' })); lead.rotation.x = Math.PI; lead.position.y = 0.06; pencil.add(lead)
  const eraser = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.4, 10), new T.MeshStandardMaterial({ color: '#ef8fa0' })); eraser.position.y = 3.8; pencil.add(eraser)
  pencil.rotation.set(-0.35, 0, 0.45); pencil.scale.setScalar(Math.min(w, h) / 8); g.add(pencil)   // a pencil sized to the page
  g.userData = { canvas: c, tex: texr, w, h, pencil, last: -1, carried: true }
  return g
}
const segLen = (s) => s.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - s[i][0], p[1] - s[i][1]), 0)
/** Draw `strokes` up to k (0..1 of the whole line, in drawing order) and put the pencil tip on the end. */
export function drawOn(book, strokes, k, { ink = '#151515', width = 7 } = {}) {
  const U = book.userData, total = strokes.reduce((a, s) => a + segLen(s), 0), upto = Math.max(0, Math.min(1, k)) * total
  let tip = strokes[0]?.[0] ?? [0.5, 0.5]
  if (Math.abs(U.last - k) > 1e-4) {
    const c = U.canvas, g = c.getContext('2d'), W = c.width, H = c.height
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(120,150,190,0.25)'; g.lineWidth = 2; for (let y = 60; y < H; y += 46) { g.beginPath(); g.moveTo(40, y); g.lineTo(W - 20, y); g.stroke() }
    g.strokeStyle = ink; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round'
    let left = upto
    for (const s of strokes) { if (left <= 0) break; g.beginPath(); g.moveTo(s[0][0] * W, s[0][1] * H); tip = s[0]
      for (let i = 1; i < s.length && left > 0; i++) { const d = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]), f = Math.min(1, left / d); tip = [s[i - 1][0] + (s[i][0] - s[i - 1][0]) * f, s[i - 1][1] + (s[i][1] - s[i - 1][1]) * f]; g.lineTo(tip[0] * W, tip[1] * H); left -= d }
      g.stroke() }
    U.tex.needsUpdate = true; U.last = k; U.tip = tip
  }
  tip = U.tip ?? tip; U.pencil.position.set((tip[0] - 0.5) * U.w, 0.15 + Math.sin(k * 60) * 0.03, (tip[1] - 0.5) * U.h)
}
// ---- ready-made doodles (page units), crude on purpose ----
const ring = (cx, cy, r, n = 28, from = 0, to = Math.PI * 2, wob = 0.015) => Array.from({ length: n + 1 }, (_, i) => { const a = from + ((to - from) * i) / n; return [cx + Math.cos(a) * (r + Math.sin(i * 2.3) * wob), cy + Math.sin(a) * (r + Math.cos(i * 1.7) * wob)] })
export const DOODLES = {
  bird: [ring(0.48, 0.52, 0.2), [[0.32, 0.45], [0.18, 0.32], [0.36, 0.5]], [[0.62, 0.42], [0.82, 0.28], [0.64, 0.5]], [[0.66, 0.52], [0.78, 0.55], [0.66, 0.58]], [[0.56, 0.46], [0.57, 0.47]], [[0.44, 0.72], [0.42, 0.8]], [[0.52, 0.72], [0.54, 0.8]]],
  flower: [ring(0.5, 0.35, 0.08), ...[0, 1, 2, 3, 4].map((i) => ring(0.5 + Math.cos((i * 2 * Math.PI) / 5) * 0.14, 0.35 + Math.sin((i * 2 * Math.PI) / 5) * 0.14, 0.07, 16)), [[0.5, 0.43], [0.49, 0.6], [0.5, 0.82]], [[0.5, 0.65], [0.38, 0.58], [0.5, 0.68]]],
  heart: [[[0.5, 0.75], [0.25, 0.48], ...ring(0.37, 0.38, 0.13, 14, Math.PI * 0.8, Math.PI * 2), ...ring(0.63, 0.38, 0.13, 14, Math.PI, Math.PI * 2.2), [0.75, 0.48], [0.5, 0.75]]],
  star: [[[0.5, 0.15], [0.6, 0.42], [0.88, 0.42], [0.66, 0.6], [0.75, 0.88], [0.5, 0.71], [0.25, 0.88], [0.34, 0.6], [0.12, 0.42], [0.4, 0.42], [0.5, 0.15]]],
  sun: [ring(0.5, 0.5, 0.16), ...Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return [[0.5 + Math.cos(a) * 0.22, 0.5 + Math.sin(a) * 0.22], [0.5 + Math.cos(a) * 0.34, 0.5 + Math.sin(a) * 0.34]] })],
  house: [[[0.25, 0.8], [0.25, 0.45], [0.75, 0.45], [0.75, 0.8], [0.25, 0.8]], [[0.2, 0.47], [0.5, 0.2], [0.8, 0.47]], [[0.44, 0.8], [0.44, 0.62], [0.56, 0.62], [0.56, 0.8]]],
}

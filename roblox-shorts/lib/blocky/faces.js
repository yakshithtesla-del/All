// Drawn faces stuck on blocky heads. All the acting comes from swapping them.
// Two families: DRAWN (the kit's rt_faces.py: white eyes with coloured irises) and INK (the pack v3 face atlas,
// faces.py: thick black ink, dot / ring eyes, red open mouths, sweat, blush). Keep one family per character:
// Char({ faces: 'ink' }) draws happy / scared / sleepy / blink in ink too.
// faceSheet(skin, { ink }) draws every face for one skin colour into an 8x5 sheet of 512 px cells.
import { T, D } from './core.js'

const DRAWN = ['happy', 'scared', 'sleepy', 'asleep', 'yawn', 'shock', 'smug', 'stern', 'blink', 'wired', 'c_tired', 'c_yawn', 'c_grin', 'c_asleep', 'dad_asleep', 'mom', 'look']
/** The ink family (24 with happy, scared, sleepy, blink). New faces go at the END of FACE_NAMES, never reorder. */
export const INK_FACES = ['neutral', 'happy', 'sad', 'cry', 'angry', 'shocked', 'scared', 'sleepy', 'talk', 'smirk', 'blink', 'creepy', 'smile', 'laugh', 'nervous', 'dizzy', 'squeeze', 'wink', 'oh', 'content', 'sparkle', 'sparkle_oh', 'nerd', 'stare']
export const FACE_NAMES = [...DRAWN, ...INK_FACES.filter((n) => !DRAWN.includes(n))]
export const FACE_ALIAS = { panic: 'scared', surprised: 'shocked', unimpressed: 'sleepy', relieved: 'content', glasses: 'nerd', brace: 'squeeze' }
export const SHEET_COLS = 8, SHEET_ROWS = 5
const INK = '#16121c'

function eye(c, x, y, r, iris, { look = [0, 0], lid = 0, pupil = 0.5, bags = 0, red = false, lash = false, lowLid = 0, side = 1, lidCol } = {}) {
  const rx = r * 0.86, ry = r * 1.06
  for (let k = 0; k < bags; k++) stroke(c, r * 0.1, 'rgba(96,62,120,0.92)', () => { const yy = y + ry * (1.02 + 0.3 * k); c.moveTo(x - rx * 0.95, yy - r * 0.1); c.quadraticCurveTo(x, yy + r * 0.36, x + rx * 0.95, yy - r * 0.1) })
  c.save(); c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.clip()
  c.fillStyle = '#fafafc'; c.fillRect(x - rx, y - ry, 2 * rx, 2 * ry); c.fillStyle = '#bec4d6'; c.fillRect(x - rx, y - ry, 2 * rx, ry * 0.45)
  if (red) for (let a = 0; a < 360; a += 36) { const aa = D(a + 13); stroke(c, r * 0.04, '#d63034', () => { c.moveTo(x + Math.cos(aa) * rx * 1.05, y + Math.sin(aa) * ry * 1.05); c.quadraticCurveTo(x + Math.cos(aa + 0.35) * rx * 0.8, y + Math.sin(aa + 0.35) * ry * 0.8, x + Math.cos(aa - 0.1) * rx * 0.5, y + Math.sin(aa - 0.1) * ry * 0.5) }) }
  const ir = r * (0.3 + 0.52 * pupil), ix = x + look[0] * rx * 0.4, iy = y + look[1] * ry * 0.4 + r * 0.04, ic = new T.Color(iris)
  disc(c, ix, iy, ir, `rgb(${ic.r * 115},${ic.g * 115},${ic.b * 128})`); disc(c, ix, iy + ir * 0.12, ir * 0.86, iris)
  disc(c, ix, iy + ir * 0.42, ir * 0.5, `rgb(${Math.min(255, ic.r * 255 + 70)},${Math.min(255, ic.g * 255 + 60)},${Math.min(255, ic.b * 255 + 40)})`)
  disc(c, ix, iy, ir * 0.46, INK); disc(c, ix - ir * 0.36, iy - ir * 0.4, ir * 0.3, '#fff'); disc(c, ix + ir * 0.34, iy + ir * 0.36, ir * 0.13, 'rgba(255,255,255,0.9)')
  if (lid > 0) { const yl = y - ry + 2 * ry * lid; c.fillStyle = lidCol; c.fillRect(x - rx * 1.2, y - ry * 1.2, rx * 2.4, yl - (y - ry * 1.2)); stroke(c, r * 0.16, INK, () => { c.moveTo(x - rx * 1.2, yl); c.lineTo(x + rx * 1.2, yl) }) }
  if (lowLid > 0) { const yl = y + ry - 2 * ry * lowLid; c.fillStyle = lidCol; c.fillRect(x - rx * 1.2, yl, rx * 2.4, y + ry * 1.2 - yl); stroke(c, r * 0.08, INK, () => { c.moveTo(x - rx * 1.2, yl); c.lineTo(x + rx * 1.2, yl) }) }
  c.restore()
  stroke(c, r * 0.07, INK, () => c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2))
  if (lid <= 0.02) { stroke(c, r * 0.2, INK, () => c.ellipse(x, y - ry * 0.02, rx * 1.03, ry * 1.02, 0, D(198), D(342))); stroke(c, r * 0.14, INK, () => { c.moveTo(x + side * rx * 0.92, y - ry * 0.42); c.lineTo(x + side * rx * 1.28, y - ry * 0.74) }) }
  if (lash) for (const k of [0.55, 0.9]) stroke(c, r * 0.1, INK, () => { c.moveTo(x + side * rx * k, y - ry * (1 - 0.25 * k)); c.lineTo(x + side * rx * (k + 0.34), y - ry * (1.42 - 0.3 * k)) })
}
function disc(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill() }
function stroke(c, w, col, f) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); f(); c.stroke() }
const closed = (c, x, y, r, up = true, w) => stroke(c, w ?? r * 0.2, INK, () => { const s = up ? -1 : 1; c.moveTo(x - r, y); c.quadraticCurveTo(x, y + s * r * 0.8, x + r, y) })
const brow = (c, x, y, r, tilt, w = 0.16) => stroke(c, r * w, INK, () => { c.moveTo(x - r, y + tilt * r); c.quadraticCurveTo(x, y - r * 0.12, x + r, y - tilt * r) })
const mArc = (c, x, y, w, h, wd = 10) => stroke(c, wd, INK, () => { c.moveTo(x - w, y); c.quadraticCurveTo(x, y + h, x + w, y) })
function mOpen(c, x, y, w, h, { tongue = true, teeth = false } = {}) {
  c.save(); c.beginPath(); c.ellipse(x, y, w, h, 0, 0, Math.PI * 2); c.fillStyle = '#601624'; c.fill(); c.clip()
  if (tongue) disc(c, x, y + h, w * 0.8, '#e2606e'); if (teeth) { c.fillStyle = '#fafafa'; c.fillRect(x - w, y - h, 2 * w, h * 0.5) }
  c.restore(); stroke(c, 9, INK, () => c.ellipse(x, y, w, h, 0, 0, Math.PI * 2))
}
function grin(c, x, y, w, h) { c.beginPath(); c.moveTo(x - w, y - h * 0.2); c.quadraticCurveTo(x, y + h * 0.2, x + w, y - h * 0.2); c.quadraticCurveTo(x, y + h * 1.9, x - w, y - h * 0.2); c.closePath(); c.fillStyle = '#fafafa'; c.fill(); c.strokeStyle = INK; c.lineWidth = 9; c.stroke() }
const zig = (c, x0, y0, n, dx, dy) => stroke(c, 9, INK, () => { c.moveTo(x0, y0); for (let i = 0; i < n; i++) c.lineTo(x0 + (i + 1) * dx, y0 + (i % 2 === 0 ? dy : -dy)) })
const sweat = (c, x0, y0) => { for (let k = 0; k < 3; k++) stroke(c, 5, 'rgba(70,90,160,0.8)', () => { c.moveTo(x0 + k * 16, y0 + k * 4); c.lineTo(x0 + k * 16, y0 + 46 + k * 6) }) }

// ---- the ink family (pack v3 faces.py, same numbers on a 512 cell)
const RED = 'rgb(232,71,76)', TONGUE = 'rgb(255,138,150)', TEAR = 'rgb(120,190,255)', BLUSH = 'rgba(255,120,130,0.6)', PLUM = 'rgb(88,62,110)', WHITE = '#fff'
function inkFace(c, name) {
  const S = 512, W = S * 0.04, PI = Math.PI, ex = [S * 0.31, S * 0.69], ey = S * 0.42, er = S * 0.07, my = S * 0.70
  const ell = (x0, y0, x1, y1, fill, outline, w = W) => { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2
    if (fill) { c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, 2 * PI); c.fillStyle = fill; c.fill() }
    if (outline) { c.beginPath(); c.ellipse(cx, cy, Math.max(1, rx - w / 2), Math.max(1, ry - w / 2), 0, 0, 2 * PI); c.lineWidth = w; c.strokeStyle = outline; c.stroke() } }
  const line = (pts, w = W, join = 'miter') => { c.beginPath(); c.moveTo(...pts[0]); for (const p of pts.slice(1)) c.lineTo(...p); c.lineWidth = w; c.strokeStyle = INK; c.lineCap = 'butt'; c.lineJoin = join; c.stroke() }
  const arc = (x0, y0, x1, y1, a0, a1, w = W) => { c.beginPath(); c.ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 - w / 2, (y1 - y0) / 2 - w / 2, 0, D(a0), D(a1)); c.lineWidth = w; c.strokeStyle = INK; c.lineCap = 'butt'; c.stroke() }
  const chord = (x0, y0, x1, y1, a0, a1, fill, outline = INK) => { c.beginPath(); c.ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0, D(a0), D(a1)); c.closePath(); c.fillStyle = fill; c.fill()
    if (outline) { c.beginPath(); c.ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 - W / 2, (y1 - y0) / 2 - W / 2, 0, D(a0), D(a1)); c.closePath(); c.lineWidth = W; c.strokeStyle = outline; c.lineJoin = 'miter'; c.stroke() } }
  const poly = (pts, fill) => { c.beginPath(); c.moveTo(...pts[0]); for (const p of pts.slice(1)) c.lineTo(...p); c.closePath(); c.fillStyle = fill; c.fill() }
  const dot = (x, y, r = er, tall = 1.3) => ell(x - r, y - r * tall, x + r, y + r * tall, INK)
  const ring = (x, y, r = er * 1.55, pupil = 0.3) => { ell(x - r, y - r, x + r, y + r, WHITE, INK, W * 0.7); const p = r * pupil; ell(x - p, y - p, x + p, y + p, INK) }
  const arcEye = (x, y, up = true, r = er * 1.15) => arc(x - r, y - r * 0.9, x + r, y + r * 0.9, up ? 195 : 15, up ? 345 : 165)
  const brow = (x, y, tilt, L = er * 1.5) => { const inner = x < S / 2 ? 1 : -1; line([[x - L, y + (inner < 0 ? tilt : -tilt)], [x + L, y + (inner < 0 ? -tilt : tilt)]]) }
  const flat = (w = 0.07, y = my) => line([[S * (0.5 - w), y], [S * (0.5 + w), y]])
  const smile = (w = 0.11, h = 0.06, y = my, up = true) => arc(S * (0.5 - w), y - S * h, S * (0.5 + w), y + S * h, up ? 15 : 195, up ? 165 : 345)
  const openSmile = (w = 0.13, h = 0.11, y = my - S * 0.03) => { chord(S * (0.5 - w), y - S * h, S * (0.5 + w), y + S * h, 0, 180, RED); line([[S * (0.5 - w), y], [S * (0.5 + w), y]]) }
  const oMouth = (r = 0.06, y = my + S * 0.02, fill = RED, sq = 1.15) => ell(S * (0.5 - r), y - S * r * sq, S * (0.5 + r), y + S * r * sq, fill, INK, Math.max(1.5, Math.min(W, S * r * 0.4)))
  const sweat = (x = S * 0.84, y = S * 0.40, r = S * 0.032) => { poly([[x, y - r * 2.4], [x + r * 1.05, y], [x - r * 1.05, y]], INK); ell(x - r * 1.15, y - r * 1.15, x + r * 1.15, y + r * 1.15, INK)
    poly([[x, y - r * 1.8], [x + r * 0.7, y], [x - r * 0.7, y]], TEAR); ell(x - r * 0.8, y - r * 0.8, x + r * 0.8, y + r * 0.8, TEAR) }
  const cheeks = (dy = 2.2, r = 1.15) => { for (const x of ex) ell(x - er * r, ey + er * dy, x + er * r, ey + er * (dy + 0.9), BLUSH) }
  const zigzag = (w = 0.12, y = my, n = 6, amp = 0.022) => line(Array.from({ length: n + 1 }, (_, i) => [S * (0.5 - w + 2 * w * i / n), y + (i % 2 ? S * amp : -S * amp)]), W, 'round')
  const spiral = (x, y, r = er * 1.5, turns = 2.3) => line(Array.from({ length: 60 }, (_, i) => { const a = i / 59 * turns * 2 * PI, rr = r * i / 59; return [x + rr * Math.cos(a), y + rr * Math.sin(a)] }), W * 0.8, 'round')
  const sparkleEye = (x, y, r = er * 1.75) => { ell(x - r, y - r * 1.15, x + r, y + r * 1.15, INK); ell(x - r * 0.62, y - r * 0.2, x + r * 0.62, y + r * 0.95, PLUM)
    ell(x - r * 0.7, y - r * 0.85, x - r * 0.05, y - r * 0.2, WHITE); ell(x + r * 0.2, y + r * 0.25, x + r * 0.55, y + r * 0.6, WHITE)
    for (const k of [-1, 0, 1]) line([[x + k * r * 0.7, y - r * 1.05], [x + k * r * 0.95, y - r * 1.45]], W * 0.7) }
  switch (name) {
    case 'neutral': for (const x of ex) dot(x, ey); flat(); break
    case 'happy': for (const x of ex) arcEye(x, ey); openSmile(); cheeks(); break
    case 'sad': for (const x of ex) dot(x, ey + er * 0.3, er * 0.9); for (const x of ex) brow(x, ey - er * 2.1, -er * 0.55); smile(0.08, 0.05, my + S * 0.05, false); break
    case 'cry': for (const x of ex) arcEye(x, ey, false); for (const x of ex) brow(x, ey - er * 2.0, -er * 0.55)
      for (const x of ex) poly([[x - er * 0.5, ey + er * 0.7], [x + er * 0.5, ey + er * 0.7], [x + er * 0.75, S * 0.93], [x - er * 0.75, S * 0.93]], TEAR); oMouth(0.06, my + S * 0.03, RED, 0.85); break
    case 'angry': for (const x of ex) ring(x, ey + er * 0.2, er * 1.45, 0.36); for (const x of ex) brow(x, ey - er * 1.75, er * 0.85, er * 1.7); oMouth(0.065, my + S * 0.03, RED, 0.95); break
    case 'shocked': for (const x of ex) ring(x, ey, er * 1.6, 0.24); oMouth(0.085, my + S * 0.03); sweat(); break
    case 'scared': { for (const x of ex) ring(x, ey, er * 1.55, 0.22); for (const x of ex) brow(x, ey - er * 2.4, -er * 0.6)
      const x0 = S * 0.33, y0 = my - S * 0.07, x1 = S * 0.67, y1 = my + S * 0.09; c.beginPath(); c.roundRect(x0, y0, x1 - x0, y1 - y0, S * 0.05); c.fillStyle = WHITE; c.fill()
      c.beginPath(); c.roundRect(x0 + W / 2, y0 + W / 2, x1 - x0 - W, y1 - y0 - W, S * 0.05 - W / 2); c.lineWidth = W; c.strokeStyle = INK; c.stroke()
      line([[x0, my + S * 0.01], [x1, my + S * 0.01]], W * 0.6); for (let i = 1; i < 5; i++) { const x = S * (0.33 + i * 0.068); line([[x, y0], [x, y1]], W * 0.6) } sweat(); break }
    case 'sleepy': for (const x of ex) { chord(x - er * 1.15, ey - er * 1.2, x + er * 1.15, ey + er * 1.2, 0, 180, INK, null); line([[x - er * 1.45, ey], [x + er * 1.45, ey]]) } flat(0.06); break
    case 'talk': for (const x of ex) dot(x, ey); ell(S * 0.42, my - S * 0.05, S * 0.58, my + S * 0.08, RED, INK); ell(S * 0.455, my + S * 0.015, S * 0.545, my + S * 0.07, TONGUE); break
    case 'smirk': for (const x of ex) dot(x, ey, er * 0.95); brow(ex[0], ey - er * 1.8, er * 0.5); brow(ex[1], ey - er * 2.3, -er * 0.35); arc(S * 0.40, my - S * 0.10, S * 0.64, my + S * 0.04, 15, 125); break
    case 'blink': for (const x of ex) line([[x - er * 1.1, ey], [x + er * 1.1, ey]]); flat(); break
    case 'creepy': for (const x of ex) { ell(x - er * 1.3, ey - er * 1.3, x + er * 1.3, ey + er * 1.3, INK); ell(x - er * 0.2, ey - er * 0.2, x + er * 0.2, ey + er * 0.2, WHITE) }
      arc(S * 0.25, my - S * 0.16, S * 0.75, my + S * 0.10, 15, 165); for (let i = 1; i < 8; i++) { const x = S * (0.27 + i * 0.058); line([[x, my + S * 0.03], [x, my + S * 0.085]], W * 0.6) } break
    case 'smile': for (const x of ex) dot(x, ey); smile(0.12, 0.07, my - S * 0.02); break
    case 'laugh': for (const x of ex) arcEye(x, ey, true, er * 1.3); chord(S * 0.34, my - S * 0.16, S * 0.66, my + S * 0.14, 0, 180, RED); line([[S * 0.34, my - S * 0.01], [S * 0.66, my - S * 0.01]])
      chord(S * 0.41, my + S * 0.04, S * 0.59, my + S * 0.16, 180, 360, TONGUE, null); break
    case 'nervous': for (const x of ex) dot(x, ey, er * 0.95); zigzag(0.09, my, 4, 0.02); sweat(); break
    case 'dizzy': for (const x of ex) spiral(x, ey); oMouth(0.075, my + S * 0.03); ell(S * 0.455, my + S * 0.03, S * 0.545, my + S * 0.10, TONGUE); break
    case 'squeeze': ex.forEach((x, i) => { const sg = i ? -1 : 1, r = er * 1.25; line([[x - sg * r, ey - r], [x + sg * r * 0.6, ey], [x - sg * r, ey + r]], W, 'round') }); zigzag(0.10, my, 6, 0.02); break
    case 'wink': dot(ex[0], ey); arcEye(ex[1], ey); openSmile(0.11, 0.09); cheeks(); break
    case 'oh': for (const x of ex) dot(x, ey); oMouth(0.045, my + S * 0.01, TONGUE, 1.0); break
    case 'content': for (const x of ex) arcEye(x, ey - er * 0.3, false, er * 1.25); smile(0.13, 0.08, my - S * 0.03); break
    case 'sparkle': for (const x of ex) sparkleEye(x, ey); smile(0.07, 0.045, my + S * 0.02); cheeks(2.6, 1.3); break
    case 'sparkle_oh': for (const x of ex) sparkleEye(x, ey); oMouth(0.04, my + S * 0.04, TONGUE, 1.0); cheeks(2.6, 1.3); break
    case 'nerd': { const r = er * 1.75; for (const x of ex) { ell(x - r, ey - r, x + r, ey + r, WHITE, INK); const p = r * 0.36; ell(x - p, ey - r * 0.55 - p, x + p, ey - r * 0.55 + p, INK) }
      line([[ex[0] + r, ey], [ex[1] - r, ey]]); oMouth(0.045, my + S * 0.04, RED, 1.1); break }
    case 'stare': for (const x of ex) ring(x, ey, er * 1.5, 0.2); flat(0.05); break
  }
}

function drawFace(c, name, skin) {
  const creature = name.startsWith('c_'), lidCol = creature ? 'rgb(188,184,210)' : `rgb(${skin})`
  const L = 168, R = 344, EY = 236, r = 64, blue = '#3c96eb', brown = '#82522e', green = '#3caa6e', violet = '#a078eb'
  const eyes = (col = blue, rr = 1, o = {}) => { eye(c, L, EY, r * rr, col, { ...o, side: -1, lidCol }); eye(c, R, EY, r * rr, col, { ...o, side: 1, lidCol }) }
  const purple = (yy) => { for (const X of [L, R]) stroke(c, 8, 'rgb(96,62,120)', () => { c.moveTo(X - 58, yy - 6); c.quadraticCurveTo(X, yy + 22, X + 58, yy - 6) }) }
  switch (name) {
    case 'happy': eyes(); brow(c, L, EY - 100, 46, 0.12); brow(c, R, EY - 100, 46, -0.12); grin(c, 256, 378, 70, 36); break
    case 'look': eyes(blue, 1, { look: [0.8, 0] }); brow(c, L, EY - 104, 46, -0.05); brow(c, R, EY - 104, 46, 0.05); mArc(c, 256, 384, 40, 10); break
    case 'mom': eyes(green, 0.95, { lash: true }); brow(c, L, EY - 100, 44, 0.16, 0.12); brow(c, R, EY - 100, 44, -0.16, 0.12); mArc(c, 256, 380, 46, 30); break
    case 'blink': closed(c, L, EY + 12, r * 0.8, false, 11); closed(c, R, EY + 12, r * 0.8, false, 11); mArc(c, 256, 380, 44, 26); break
    case 'scared': eyes(blue, 1.1, { pupil: 0.12 }); brow(c, L, EY - 112, 50, -0.34); brow(c, R, EY - 112, 50, 0.34); zig(c, 196, 392, 6, 20, 11); sweat(c, 96, 150); break
    case 'sleepy': eyes(blue, 1, { lid: 0.5, look: [0, 0.3], bags: 1 }); stroke(c, 10, INK, () => { c.moveTo(226, 388); c.lineTo(290, 388) }); break
    case 'asleep': closed(c, L, EY + 8, r * 0.8, true, 11); closed(c, R, EY + 8, r * 0.8, true, 11); c.beginPath(); c.ellipse(257, 388, 19, 22, 0, 0, Math.PI * 2); c.fillStyle = '#601624'; c.fill(); c.strokeStyle = INK; c.lineWidth = 8; c.stroke(); break
    case 'dad_asleep': {
      closed(c, L, EY + 4, r * 0.8, true, 11); closed(c, R, EY + 4, r * 0.8, true, 11); brow(c, L, EY - 84, 50, 0.1, 0.22); brow(c, R, EY - 84, 50, -0.1, 0.22)
      c.beginPath(); c.ellipse(256, 422, 20, 24, 0, 0, Math.PI * 2); c.fillStyle = '#601624'; c.fill(); c.strokeStyle = INK; c.lineWidth = 8; c.stroke()
      c.beginPath(); c.moveTo(256, 352); c.bezierCurveTo(214, 326, 150, 346, 128, 396); c.bezierCurveTo(170, 378, 220, 386, 256, 374); c.bezierCurveTo(292, 386, 342, 378, 384, 396); c.bezierCurveTo(362, 346, 298, 326, 256, 352); c.closePath()
      c.fillStyle = '#462c1c'; c.fill(); c.lineWidth = 7; c.stroke(); break }
    case 'yawn': closed(c, L, EY, r * 0.76, false, 14); closed(c, R, EY, r * 0.76, false, 14); brow(c, L, EY - 84, 46, 0.25); brow(c, R, EY - 84, 46, -0.25); mOpen(c, 256, 384, 58, 70); break
    case 'shock': eyes(blue, 1.16, { pupil: 0.06 }); brow(c, L, EY - 122, 50, -0.38); brow(c, R, EY - 122, 50, 0.38); mOpen(c, 256, 404, 44, 50); sweat(c, 92, 140); break
    case 'smug': eyes(blue, 1, { lid: 0.36, look: [0.5, 0.1] }); brow(c, L, EY - 92, 46, 0.2); brow(c, R, EY - 100, 46, 0.1); stroke(c, 10, INK, () => { c.moveTo(208, 384); c.quadraticCurveTo(266, 414, 312, 368) }); break
    case 'stern': eyes(brown, 0.94, { lid: 0.26, pupil: 0.36 }); brow(c, L, EY - 74, 58, -0.44, 0.3); brow(c, R, EY - 74, 58, 0.44, 0.3); mArc(c, 256, 408, 50, -30); break
    case 'wired': eyes(blue, 1.14, { pupil: 0.1, bags: 2, red: true }); brow(c, L, EY - 118, 48, -0.2); brow(c, R, EY - 118, 48, 0.2); zig(c, 218, 418, 4, 19, 8); break
    case 'c_tired': eye(c, L, EY, r * 1.08, violet, { lid: 0.56, look: [0, 0.45], pupil: 0.3, bags: 3, red: true, side: -1, lidCol }); eye(c, R, EY, r * 1.08, violet, { lid: 0.62, look: [0, 0.45], pupil: 0.3, bags: 3, red: true, lidCol })
      brow(c, L, EY - 96, 50, -0.3, 0.12); brow(c, R, EY - 96, 50, 0.3, 0.12); mArc(c, 256, 440, 44, -22, 9); break
    case 'c_yawn': closed(c, L, EY, r * 0.9, false, 14); closed(c, R, EY, r * 0.9, false, 14); for (let k = 0; k < 3; k++) purple(EY + 44 + 20 * k); mOpen(c, 256, 418, 62, 72, { teeth: true }); break
    case 'c_grin': eye(c, L, EY, r * 1.08, violet, { lid: 0.42, look: [0, 0.2], pupil: 0.3, bags: 3, red: true, side: -1, lidCol }); eye(c, R, EY, r * 1.08, violet, { lid: 0.42, look: [0, 0.2], pupil: 0.3, bags: 3, red: true, lidCol })
      grin(c, 256, 420, 104, 34); for (let i = 1; i < 7; i++) stroke(c, 5, INK, () => { c.moveTo(152 + i * 30, 414); c.lineTo(152 + i * 30, 462) }); break
    case 'c_asleep': closed(c, L, EY + 8, r * 0.9, true, 12); closed(c, R, EY + 8, r * 0.9, true, 12); purple(EY + 50); mArc(c, 256, 410, 56, 36, 9); break
  }
}
/** Every face for one skin colour (0-255 rgb) on one texture. Use with faceOffset(). ink: draw the shared names in the ink family. */
export function faceSheet(skin, { ink = false } = {}) {
  const cv = document.createElement('canvas'); cv.width = 512 * SHEET_COLS; cv.height = 512 * SHEET_ROWS
  const c = cv.getContext('2d'); c.fillStyle = `rgb(${skin})`; c.fillRect(0, 0, cv.width, cv.height)
  FACE_NAMES.forEach((n, i) => { c.save(); c.translate((i % SHEET_COLS) * 512, Math.floor(i / SHEET_COLS) * 512); c.beginPath(); c.rect(0, 0, 512, 512); c.clip(); (DRAWN.includes(n) && !(ink && INK_FACES.includes(n)) ? drawFace(c, n, skin) : inkFace(c, n)); c.restore() })
  const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; t.repeat.set(1 / SHEET_COLS, 1 / SHEET_ROWS); return t
}
/** Texture offset that shows one face of the sheet. */
export function faceOffset(name) {
  const i = FACE_NAMES.indexOf(FACE_ALIAS[name] ?? name); if (i < 0) throw new Error(`unknown face "${name}"; faces: ${FACE_NAMES.join(', ')}`)
  return [(i % SHEET_COLS) / SHEET_COLS, (SHEET_ROWS - 1 - Math.floor(i / SHEET_COLS)) / SHEET_ROWS]
}

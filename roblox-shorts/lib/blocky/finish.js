// The finish (the kit's rt_finish.grade) and the big top-third text. Call grade() first in a scene's overlay().
import { cl } from './core.js'

let VIG = null, SMC = null, BLC = null
/** sat < 1 calms colour: our three.js renders come out more saturated than the kit's Blender renders. */
export const LOOKS = ['none', 'night', 'danger', 'memory', 'grey', 'warm', 'cold']
/**
 * look: a colour mood for the whole frame, like the viral shorts use per scene. 'night' = blue-purple dark,
 * 'danger' = everything red on black (a monster, an alarm), 'memory' = black and white (a flashback, "as it turns out"),
 * 'grey' = washed out, 'warm' = golden hour, 'cold' = blue winter. amount 0..1 blends it in (fade it over a shot).
 */
export function grade(ctx, W, H, { sat = 1.0, look = 'none', amount = 1, lift = 0.97, bloom = 0.12, contrast = 1.1 } = {}) { // defaults measured against six viral shorts 2026-11-18: real blacks (5th pct ~0.08), highlights ~0.8; the old lift 0.84 squeezed everything into grey ("metallic"). Earlier: sat 1.04, lift 0.84 = the vivid, crisp game tone (the old soft film look was sat 0.72, lift 0.9, bloom 0.34)
  SMC ??= Object.assign(document.createElement('canvas'), { width: W / 4, height: H / 4 }); BLC ??= Object.assign(document.createElement('canvas'), { width: W / 4, height: H / 4 })
  const sx = SMC.getContext('2d', { willReadFrequently: true }); sx.drawImage(ctx.canvas, 0, 0, W / 4, H / 4)
  const si = sx.getImageData(0, 0, W / 4, H / 4); for (let i = 0; i < si.data.length; i += 4) { const k = cl((Math.max(si.data[i], si.data[i + 1], si.data[i + 2]) - 185) / 60); si.data[i] *= k; si.data[i + 1] *= k; si.data[i + 2] *= k } sx.putImageData(si, 0, 0)
  const bx = BLC.getContext('2d', { willReadFrequently: true }); bx.clearRect(0, 0, W / 4, H / 4); bx.globalCompositeOperation = 'source-over'; bx.filter = 'blur(9px)'; bx.globalAlpha = 0.6; bx.drawImage(SMC, 0, 0); bx.filter = 'blur(26px)'; bx.globalCompositeOperation = 'lighter'; bx.drawImage(SMC, 0, 0); bx.filter = 'none'; bx.globalAlpha = 1; bx.globalCompositeOperation = 'source-over'
  const bd = bx.getImageData(0, 0, W / 4, H / 4).data, id = ctx.getImageData(0, 0, W, H), d = id.data, src = new Uint8ClampedArray(d), s = Math.max(1, Math.round(W * 0.0016)), bw = W / 4
  if (!VIG) { VIG = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const r = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2)) / 1.414; VIG[y * W + x] = 1 - 0.11 * Math.pow(cl((r - 0.45) / 0.55), 1.5) } }
  const lk = Math.max(0, LOOKS.indexOf(look))
  const LUT = new Float32Array(256); for (let v = 0; v < 256; v++) LUT[v] = 255 * Math.pow(v / 255, lift)
  for (let y = 0; y < H; y++) { const by = Math.min(H / 4 - 1, y >> 2) * bw
    for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, bi = (by + Math.min(bw - 1, x >> 2)) * 4
      let r = LUT[src[i]] + bd[bi] * bloom, g = LUT[src[i + 1]] + bd[bi + 1] * bloom, b = LUT[src[i + 2]] + bd[bi + 2] * bloom
      const m = (r + g + b) / 3; r = ((m + (r - m) * sat) - 124) * contrast + 124; g = ((m + (g - m) * sat) - 124) * contrast + 124; b = ((m + (b - m) * sat) - 124) * contrast + 124
      if (lk) { const l = 0.3 * r + 0.59 * g + 0.11 * b; let R = r, G = g, B = b
        if (lk === 1) { R = r * 0.5 + l * 0.08; G = g * 0.5 + l * 0.06; B = b * 0.78 + l * 0.2 + 14 }
        else if (lk === 2) { R = l * 1.25 + 26; G = l * 0.07; B = l * 0.07 }
        else if (lk === 3) { R = G = B = (l - 118) * 1.12 + 126 }
        else if (lk === 4) { R = l + (r - l) * 0.22; G = l + (g - l) * 0.22; B = l + (b - l) * 0.22 }
        else if (lk === 5) { R = r * 1.1 + 6; G = g * 1.0; B = b * 0.84 }
        else { R = r * 0.9; G = g * 0.98; B = b * 1.1 + 6 }
        r += (R - r) * amount; g += (G - g) * amount; b += (B - b) * amount }
      const v = VIG[y * W + x]; d[i] = r * v; d[i + 1] = g * v; d[i + 2] = b * v } }
  ctx.putImageData(id, 0, 0) }

/** A white (or black) flash frame on a power moment, an impact or a reveal: full at the cut, gone after dur seconds. */
export function flash(ctx, W, H, lt, { dur = 0.15, color = '#fff' } = {}) {
  const a = 1 - lt / dur; if (a <= 0) return
  ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.2); ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.restore()
}

/** Big words in the top third (the rule on shot 1, a number on a count). accentLine = the line drawn yellow. lt = seconds into the shot (pops in). */
export function bigText(ctx, W, H, lines, lt, accentLine = lines.length > 1 ? lines.length - 1 : -1) {
  const p = Math.min(1, lt / 0.12), short = lines.every((l) => l.length <= 3), s = (short ? W * 0.26 : W * 0.085) * (0.85 + 0.15 * p)
  ctx.save(); ctx.font = `900 ${s}px "Arial Black", Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
  lines.forEach((ln, i) => { const y = H * (lines.length > 1 ? 0.13 : 0.2) + i * s * 1.08; ctx.lineWidth = s * 0.16; ctx.strokeStyle = '#000'; ctx.strokeText(ln, W / 2, y); ctx.fillStyle = i === accentLine ? '#ffe81e' : '#fff'; ctx.fillText(ln, W / 2, y) })
  ctx.restore()
}

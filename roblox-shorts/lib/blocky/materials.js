// Materials and boxes (the In This Town kit's M(), Mesher.box, part()).
// Every surface gets texture: fabric / noise / grass / asphalt are a two-tone mix (rgb*dark .. rgb*1.06) driven by fBm
// noise mapped 0.3..0.7; brick / siding / shingle / planks / tiles are the kit's brick pattern times noise.
// Kit coordinates everywhere: Z is up, characters face -Y. at() maps (x, y, z)_kit -> (x, z, -y) in three.js.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { T, cl, rnd, srgb } from './core.js'

function fbm(cells, size) {
  const lat = (k) => { const L = new Float32Array(k * k); for (let i = 0; i < k * k; i++) L[i] = rnd(); return L }
  const oct = []; let a = 1, k = cells; for (let o = 0; o < 5; o++) { oct.push([k, a, lat(k)]); a *= 0.65; k *= 2 }
  const s3 = (t) => t * t * (3 - 2 * t)
  const val = (L, k, x, y) => { const fx = x * k, fy = y * k, i = Math.floor(fx), j = Math.floor(fy), u = s3(fx - i), v = s3(fy - j), at = (p, q) => L[((q % k + k) % k) * k + ((p % k + k) % k)]
    return at(i, j) * (1 - u) * (1 - v) + at(i + 1, j) * u * (1 - v) + at(i, j + 1) * (1 - u) * v + at(i + 1, j + 1) * u * v }
  const tot = oct.reduce((s, o) => s + o[1], 0), out = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let n = 0; for (const [kk, w, L] of oct) n += w * val(L, kk, x / size, y / size); out[y * size + x] = n / tot }
  return out
}
const TEX = {}
function canvasTex(size, fill) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), im = g.createImageData(size, size); fill(im.data); g.putImageData(im, 0, 0)
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t
}
function noiseTex(kind, dark) {
  const key = kind + dark; if (TEX[key]) return TEX[key]
  const size = 256, n = fbm({ fabric: 8, noise: 2, grass: 3, asphalt: 6 }[kind], size)
  return (TEX[key] = canvasTex(size, (d) => { for (let i = 0; i < size * size; i++) { const t = cl((n[i] - 0.3) / 0.4), v = (dark + (1.06 - dark) * t) / 1.06 * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255 } }))
}
const PATTERNS = { brick: [1.6, 0.6, 0.05, 0.5, 0.62], siding: [40, 0.62, 0.05, 0, 0.74], shingle: [1.3, 0.75, 0.06, 0.5, 0.6], planks: [7, 0.9, 0.03, 0.37, 0.68], tiles: [2, 2, 0.035, 0, 0.7], cobble: [1.1, 0.55, 0.06, 0.5, 0.56], stone: [2.3, 1.15, 0.08, 0.37, 0.5] }
function patTex(kind) {
  if (TEX[kind]) return TEX[kind]
  const [bw, rh, mortar, off, dark] = PATTERNS[kind], px = 64, size = 512, n = fbm(3, size)
  return (TEX[kind] = canvasTex(size, (d) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const X = x / px, Y = y / px, row = Math.floor(Y / rh), xs = X + (row % 2) * off * bw, bi = Math.floor(xs / bw)
    const fx = xs / bw - bi, fy = Y / rh - row, e = Math.min(fx * bw, (1 - fx) * bw, fy * rh, (1 - fy) * rh), m = e < mortar ? 0 : 1, sh = ((bi * 7 + row * 13) % 5) / 5 * 0.45 + 0.55
    const t = cl(m * sh * n[y * size + x] / 0.62), v = (dark + (1.06 - dark) * t) / 1.06 * 255, i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255 } }))
}
const NOISE_DARK = { noise: 0.8, fabric: 0.7, grass: 0.62, asphalt: 0.72 }
/** Plastic material with the kit's surface texture. rgb = 0-255 sRGB. rep = texture repeats across the part. */
export function M(rgb, { rough = 0.5, tex = null, amt = null, rep = [1, 1], emit = null, k = 0 } = {}) {
  const m = new T.MeshStandardMaterial({ color: srgb(tex ? rgb.map((v) => Math.min(255, v * 1.06)) : rgb), roughness: rough })
  if (tex) { const t = (PATTERNS[tex] ? patTex(tex) : noiseTex(tex, amt != null ? 1 - amt : NOISE_DARK[tex])).clone(); t.repeat.set(...rep); t.needsUpdate = true; m.map = t }
  if (emit) { m.emissive = srgb(emit); m.emissiveIntensity = k }
  return m
}
/** A crisp block, size in kit order (x wide, y deep, z tall). bevel 0.04-0.05 for parts, 0.3 only for heads. */
export const box = (s, mat, bevel = 0.04) => { const b = Math.max(0.001, Math.min(bevel, 0.45 * Math.min(...s))), m = new T.Mesh(new RoundedBoxGeometry(s[0], s[2], s[1], 2, b), mat); m.castShadow = m.receiveShadow = true; return m }
/** Add obj to parent at kit coordinates. */
export const at = (p, o, x, y, z) => { o.position.set(x, z, -y); p.add(o); return o }
/** An empty group (a pivot) at kit coordinates. */
export const grp = (p, x = 0, y = 0, z = 0) => at(p, new T.Group(), x, y, z)

// The classic avatar: six blocky parts, a rounded cylinder head with a flat pixel face, printed clothes and sculpted hair.
// Matched part by part against a real viral short (videos/reference/nn3_MOuxoho). Units are studs: the torso is 2 wide,
// 2 tall, 1 deep; arms and legs are 1 x 2 x 1; the head is 1.24 across. three.js axes: Y up, the character faces +Z.
// Works with the collision check (parts: torso, head, armL, armR, legL, legR, soleL, soleR).
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { T, D } from './core.js'

// ---------- small helpers ----------
function rng(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }
function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8
  return t
}
const shade = (hex, k) => { const c = new T.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString() }
// smooth toy plastic: a clear coat gives the small bright highlight on edges without greying the colour
const mat = (map) => new T.MeshPhysicalMaterial({ map, roughness: 0.86, metalness: 0 })
const flat = (color) => new T.MeshPhysicalMaterial({ color, roughness: 0.86, metalness: 0 })
/** Soft light and dark patches: the washed, slightly shiny look of the printed clothes. */
function mottle(g, w, h, color, r, n = 26, amt = 0.3) {
  g.fillStyle = color; g.fillRect(0, 0, w, h)
  for (let i = 0; i < n * 2; i++) {
    const x = r() * w, y = r() * h, rad = (0.03 + r() * 0.1) * Math.max(w, h), light = r() < 0.55
    const gr = g.createRadialGradient(x, y, 0, x, y, rad)
    gr.addColorStop(0, light ? `rgba(255,255,255,${amt * 0.55})` : `rgba(0,0,0,${amt})`); gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
  }
}
/** Shading painted into the cloth, so a part never reads as one flat colour: lighter up top, darker toward the bottom and the edges. */
function shadeFace(g, w, h, amt = 1) {
  const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, `rgba(255,255,255,${0.03 * amt})`); v.addColorStop(0.35, 'rgba(255,255,255,0)'); v.addColorStop(1, `rgba(0,0,0,${0.3 * amt})`); g.fillStyle = v; g.fillRect(0, 0, w, h)
  for (const [x0, x1] of [[0, w * 0.2], [w, w * 0.8]]) { const e = g.createLinearGradient(x0, 0, x1, 0); e.addColorStop(0, `rgba(0,0,0,${0.2 * amt})`); e.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = e; g.fillRect(0, 0, w, h) }
}
/** A ribbed band (cuffs, hems): thin vertical lines. */
function ribs(g, x, y, w, h, color) {
  g.fillStyle = shade(color, 0.86); g.fillRect(x, y, w, h)
  g.strokeStyle = shade(color, 0.6); g.lineWidth = 2
  for (let i = x + 3; i < x + w; i += 7) { g.beginPath(); g.moveTo(i, y); g.lineTo(i, y + h); g.stroke() }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y, w, 3)
}
function star(g, x, y, r, rot = 0) {
  g.beginPath()
  for (let i = 0; i < 10; i++) { const a = rot + (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr) }
  g.closePath()
}

// ---------- clothes: printed textures on the boxes ----------
/** top: { kind: 'jacket' | 'hoodie' | 'tee' | 'plaid' | 'suit' | 'zip' | 'denim' (stripes: true) | 'vest' | 'uniform' | 'letter' (text) | 'stripes', color, inner?, print?: 'stars' | 'none', seed? } */
function topTextures(top, skin) {
  const c = top.color ?? '#0e21a4', inner = top.inner ?? '#eeeeee', r = rng(top.seed ?? 3)
  const base = (g, w, h) => {
    if (top.kind === 'plaid') {
      g.fillStyle = c; g.fillRect(0, 0, w, h)
      for (let i = 0; i < w; i += 64) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(i, 0, 26, h); g.fillRect(0, i, w, 26); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(i + 40, 0, 6, h); g.fillRect(0, i + 40, w, 6) }
    } else mottle(g, w, h, c, r, 20, top.kind === 'jacket' ? 0.05 : 0.025)
  }
  const crop = (g, w, h) => { if (top.crop) { g.fillStyle = skin; g.fillRect(0, h * 0.58, w, h); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, h * 0.58 - 6, w, 6) } } // crop: true shows the waist
  const hem = (g, w, h) => { if (top.kind === 'jacket' || top.kind === 'hoodie' || top.kind === 'zip') ribs(g, 0, h - 54, w, 54, c) }
  const front = canvas(512, 512, (g, w, h) => {
    base(g, w, h)
    if (top.kind === 'jacket') {
      // open collar with the inner shirt, then the zip
      g.fillStyle = inner; g.beginPath(); g.moveTo(206, 0); g.lineTo(306, 0); g.lineTo(256, 96); g.closePath(); g.fill()
      g.strokeStyle = shade(c, 0.55); g.lineWidth = 9; g.beginPath(); g.moveTo(202, 0); g.lineTo(256, 100); g.lineTo(310, 0); g.stroke()
      g.strokeStyle = '#c9cede'; g.lineWidth = 6; g.beginPath(); g.moveTo(256, 98); g.lineTo(256, h); g.stroke()
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.setLineDash([5, 5]); g.beginPath(); g.moveTo(256, 98); g.lineTo(256, h); g.stroke(); g.setLineDash([])
    } else if (top.kind === 'suit') {
      // shirt and tie in the opening, dark lapels, three buttons, a belt line
      g.fillStyle = inner; g.beginPath(); g.moveTo(176, 0); g.lineTo(336, 0); g.lineTo(256, 190); g.closePath(); g.fill()
      g.fillStyle = shade(inner, 0.86); g.beginPath(); g.moveTo(176, 0); g.lineTo(226, 0); g.lineTo(250, 62); g.lineTo(214, 84); g.closePath(); g.fill(); g.beginPath(); g.moveTo(336, 0); g.lineTo(286, 0); g.lineTo(262, 62); g.lineTo(298, 84); g.closePath(); g.fill()
      g.fillStyle = top.tie ?? shade(c, 0.62); g.beginPath(); g.moveTo(240, 22); g.lineTo(272, 22); g.lineTo(266, 60); g.lineTo(282, 150); g.lineTo(256, 186); g.lineTo(230, 150); g.lineTo(246, 60); g.closePath(); g.fill()
      for (const sx of [-1, 1]) { g.fillStyle = shade(c, 0.74); g.beginPath(); g.moveTo(256 + sx * 86, 0); g.lineTo(256 + sx * 150, 0); g.lineTo(256 + sx * 118, 150); g.lineTo(256 + sx * 8, 262); g.lineTo(256 + sx * 4, 196); g.closePath(); g.fill()
        g.strokeStyle = shade(c, 0.3); g.lineWidth = 10; g.lineJoin = 'round'; g.beginPath(); g.moveTo(256 + sx * 86, 0); g.lineTo(256 + sx * 4, 196); g.lineTo(256 + sx * 8, 262); g.lineTo(256 + sx * 118, 150); g.lineTo(256 + sx * 150, 0); g.stroke() }
      g.strokeStyle = shade(c, 0.3); g.lineWidth = 8; g.beginPath(); g.moveTo(256, 262); g.lineTo(256, h); g.stroke()
      for (const y of [300, 352, 404]) { g.fillStyle = '#e8e2d2'; g.beginPath(); g.arc(272, y, 9, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(272, y, 3.5, 0, 7); g.fill() }
      g.fillStyle = shade(c, 0.3); g.fillRect(0, h - 66, w, 12); g.fillStyle = shade(c, 0.8); g.fillRect(0, h - 54, w, 54)
      g.strokeStyle = shade(c, 0.5); g.lineWidth = 4; for (const x of [70, 380]) { g.beginPath(); g.moveTo(x, 330); g.lineTo(x + 62, 330); g.stroke() }
    } else if (top.kind === 'hoodie') {
      g.strokeStyle = shade(c, 0.6); g.lineWidth = 6; g.beginPath(); g.moveTo(150, 0); g.quadraticCurveTo(256, 120, 362, 0); g.stroke()
      g.strokeStyle = '#f0f0f0'; g.lineWidth = 6; for (const x of [228, 284]) { g.beginPath(); g.moveTo(x, 60); g.lineTo(x, 190); g.stroke() }
      g.strokeStyle = shade(c, 0.6); g.lineWidth = 5; g.strokeRect(150, 300, 212, 130)
    } else if (top.kind === 'tee') {
      g.strokeStyle = shade(c, 0.7); g.lineWidth = 12; g.beginPath(); g.arc(256, -20, 86, 0.25, Math.PI - 0.25); g.stroke()
    } else if (top.kind === 'plaid') {
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 5; g.beginPath(); g.moveTo(256, 0); g.lineTo(256, h); g.stroke()
      g.fillStyle = '#e8e8e8'; for (let y = 70; y < h; y += 90) { g.beginPath(); g.arc(256, y, 8, 0, 7); g.fill() }
    } else if (top.kind === 'zip') {
      // a zip hoodie: the inner shirt at the neck, drawstrings, a zip, two pockets
      g.fillStyle = inner; g.beginPath(); g.moveTo(190, 0); g.lineTo(322, 0); g.lineTo(256, 120); g.closePath(); g.fill()
      g.strokeStyle = shade(c, 0.4); g.lineWidth = 10; g.lineJoin = 'round'; g.beginPath(); g.moveTo(186, 0); g.lineTo(256, 124); g.lineTo(326, 0); g.stroke()
      g.strokeStyle = '#d8dbe2'; g.lineWidth = 9; g.beginPath(); g.moveTo(256, 122); g.lineTo(256, h); g.stroke(); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(256, 122); g.lineTo(256, h); g.stroke(); g.setLineDash([])
      g.fillStyle = '#c9ced6'; g.fillRect(246, 116, 20, 26)
      g.strokeStyle = '#e9e9e9'; g.lineWidth = 6; for (const x of [214, 298]) { g.beginPath(); g.moveTo(x, 60); g.lineTo(x + (x < 256 ? -6 : 6), 210); g.stroke() }
      g.strokeStyle = shade(c, 0.45); g.lineWidth = 7; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(256 + sx * 24, 300); g.lineTo(256 + sx * 150, 300); g.lineTo(256 + sx * 186, 440); g.lineTo(256 + sx * 24, 440); g.stroke() }
    } else if (top.kind === 'denim') {
      // an open denim jacket over a shirt (inner colour; stripes: true for a striped shirt)
      g.fillStyle = inner; g.fillRect(170, 0, 172, h)
      if (top.stripes) { g.fillStyle = shade(inner, 0.72); for (let y = 30; y < h; y += 46) g.fillRect(170, y, 172, 16) }
      g.strokeStyle = shade(inner, 0.6); g.lineWidth = 8; g.beginPath(); g.arc(256, -26, 70, 0.3, Math.PI - 0.3); g.stroke()
      for (const sx of [-1, 1]) { const x0 = sx < 0 ? 0 : 342
        g.fillStyle = c; g.fillRect(x0, 0, 170, h); for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.04 + r() * 0.07})`; g.fillRect(x0 + r() * 170, r() * h, 2, 3 + r() * 8) }
        g.fillStyle = shade(c, 0.78); g.beginPath(); g.moveTo(256 + sx * 86, 0); g.lineTo(256 + sx * 170, 0); g.lineTo(256 + sx * 86, 150); g.closePath(); g.fill()
        g.strokeStyle = '#d9b46a'; g.lineWidth = 4; g.setLineDash([10, 7]); g.beginPath(); g.moveTo(256 + sx * 92, 0); g.lineTo(256 + sx * 92, h); g.moveTo(256 + sx * 110, 210); g.lineTo(256 + sx * 230, 210); g.lineTo(256 + sx * 230, 290); g.lineTo(256 + sx * 110, 290); g.stroke(); g.setLineDash([])
        g.fillStyle = '#d9b46a'; for (const y of [60, 180, 300, 420]) { g.beginPath(); g.arc(256 + sx * 104, y, 9, 0, 7); g.fill() } }
    } else if (top.kind === 'vest') {
      // a work vest with reflective bands over a shirt (inner colour)
      g.fillStyle = inner; g.beginPath(); g.moveTo(180, 0); g.lineTo(332, 0); g.lineTo(256, 170); g.closePath(); g.fill()
      for (const y of [250, 380]) { g.fillStyle = '#e9edf0'; g.fillRect(0, y, w, 50); g.fillStyle = '#f7e24a'; g.fillRect(0, y + 14, w, 22) }
      for (const x of [110, 366]) { g.fillStyle = '#e9edf0'; g.fillRect(x, 0, 36, 250); g.fillStyle = '#f7e24a'; g.fillRect(x + 10, 0, 16, 250) }
      g.strokeStyle = shade(c, 0.45); g.lineWidth = 7; g.beginPath(); g.moveTo(256, 170); g.lineTo(256, h); g.stroke()
    } else if (top.kind === 'uniform') {
      // a uniform shirt: collar, tie, pocket flaps, a gold badge, shoulder straps
      g.fillStyle = shade(c, 0.8); for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(256, 60); g.lineTo(256 + sx * 96, 0); g.lineTo(256 + sx * 60, 110); g.closePath(); g.fill() }
      g.fillStyle = top.tie ?? '#1c2233'; g.beginPath(); g.moveTo(240, 50); g.lineTo(272, 50); g.lineTo(284, 300); g.lineTo(256, 340); g.lineTo(228, 300); g.closePath(); g.fill()
      g.strokeStyle = shade(c, 0.5); g.lineWidth = 6; for (const x of [70, 330]) { g.strokeRect(x, 190, 110, 100); g.beginPath(); g.moveTo(x, 222); g.lineTo(x + 110, 222); g.stroke() }
      g.fillStyle = '#f2c230'; star(g, 385, 150, 34, 0); g.fill(); g.strokeStyle = '#a8801c'; g.lineWidth = 4; g.stroke()
      g.fillStyle = shade(c, 0.5); g.fillRect(0, h - 70, w, 34); g.fillStyle = '#d9c36a'; g.fillRect(232, h - 76, 48, 46)
    } else if (top.kind === 'letter') {
      // a tee with a big letter or number in a box (top.text)
      g.fillStyle = top.box ?? '#ffffff'; g.fillRect(126, 130, 260, 260); g.strokeStyle = top.ink ?? '#d8322c'; g.lineWidth = 14; g.strokeRect(126, 130, 260, 260)
      g.fillStyle = top.ink ?? '#d8322c'; g.font = '700 220px Montserrat, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(top.text ?? 'A').slice(0, 2), 256, 268)
    } else if (top.kind === 'stripes') {
      g.fillStyle = inner; for (let y = 50; y < h; y += 100) g.fillRect(0, y, w, 46)
      g.strokeStyle = shade(c, 0.6); g.lineWidth = 12; g.beginPath(); g.arc(256, -20, 86, 0.25, Math.PI - 0.25); g.stroke()
    }
    if ((top.print ?? (top.kind === 'jacket' ? 'stars' : 'none')) === 'stars') {
      g.strokeStyle = '#ffffff'; g.lineJoin = 'round'
      for (const [x, y, s, w2] of [[120, 372, 46, 9], [60, 396, 20, 5], [176, 414, 16, 5], [396, 250, 16, 5], [440, 300, 22, 6]]) { g.lineWidth = w2; star(g, x, y, s, 0.2); g.stroke() }
      g.lineWidth = 12; g.beginPath(); g.ellipse(400, 190, 74, 26, -0.35, 0, 7); g.stroke()
      g.fillStyle = '#ffffff'; star(g, 372, 176, 26, -0.3); g.fill()
    }
    hem(g, w, h); crop(g, w, h); shadeFace(g, w, h)
  })
  const suitBelt = (g, w, h) => { if (top.kind === 'suit') { g.fillStyle = shade(c, 0.55); g.fillRect(0, h - 64, w, 10); g.fillStyle = shade(c, 0.86); g.fillRect(0, h - 54, w, 54) } }
  const plain = canvas(256, 512, (g, w, h) => { base(g, w, h); hem(g, w, h); suitBelt(g, w, h); crop(g, w, h); shadeFace(g, w, h) })
  const back = canvas(512, 512, (g, w, h) => { base(g, w, h); hem(g, w, h); suitBelt(g, w, h); if (top.kind === 'suit') { g.strokeStyle = shade(c, 0.6); g.lineWidth = 5; g.beginPath(); g.moveTo(256, 0); g.lineTo(256, h - 64); g.stroke() } crop(g, w, h); shadeFace(g, w, h) })
  const short = ['tee', 'letter', 'stripes', 'uniform'].includes(top.kind), sleeve = top.sleeve ?? (top.kind === 'vest' ? 0 : short ? 0.35 : 0.74) // how far down the arm the sleeve goes
  const arm = canvas(256, 512, (g, w, h) => {
    g.fillStyle = skin; g.fillRect(0, 0, w, h)
    if (top.kind === 'vest') { g.fillStyle = inner; g.fillRect(0, 0, w, h * 0.7); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, h * 0.7 - 6, w, 6) }
    g.save(); g.beginPath(); g.rect(0, 0, w, h * sleeve); g.clip(); base(g, w, h); if (top.kind === 'stripes') { g.fillStyle = inner; for (let y = 50; y < h; y += 100) g.fillRect(0, y, w, 46) } g.restore()
    if (top.kind === 'jacket' || top.kind === 'hoodie' || top.kind === 'zip') ribs(g, 0, h * sleeve - 46, w, 46, c)
    else if (top.kind === 'denim') { g.fillStyle = shade(c, 1.5); g.fillRect(0, h * sleeve - 50, w, 50); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, h * sleeve - 56, w, 6) }
    else { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, h * sleeve - 6, w, 6) }
    if (top.kind === 'suit') { g.fillStyle = inner; g.fillRect(0, h * sleeve - 16, w, 16); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, h * sleeve - 22, w, 6) }
    shadeFace(g, w, h, 0.8)
  })
  const cap = canvas(64, 64, (g, w, h) => base(g, w, h))
  return { front, back, plain, arm, cap }
}
/** pants: { kind: 'jeans' | 'plain' | 'stripe' | 'shorts' | 'skirt', color, shoes?, sole?, seed? } */
function pantsTextures(pants, skin = '#c09670') {
  const c = pants.color ?? '#1a2542', r = rng(pants.seed ?? 5)
  const leg = (side) => canvas(256, 512, (g, w, h) => {
    mottle(g, w, h, c, r, 12, pants.kind === 'jeans' ? 0.1 : 0.03)
    if (pants.kind === 'jeans') {
      const wash = g.createLinearGradient(0, 0, w, 0); wash.addColorStop(0, 'rgba(0,0,0,0)'); wash.addColorStop(0.5, 'rgba(150,175,225,0.32)'); wash.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = wash; g.fillRect(0, 40, w, h - 110)
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + r() * 0.08})`; g.fillRect(r() * w, r() * h, 2, 2 + r() * 6) }
      g.strokeStyle = '#c8b28a'; g.lineWidth = 3; g.setLineDash([9, 6])
      if (side === 'front') { g.beginPath(); g.moveTo(20, 0); g.quadraticCurveTo(40, 110, 210, 120); g.stroke() }
      g.beginPath(); g.moveTo(w - 12, 0); g.lineTo(w - 12, h); g.stroke()
      g.beginPath(); g.moveTo(0, h - 34); g.lineTo(w, h - 34); g.stroke(); g.setLineDash([])
    } else if (pants.kind === 'stripe') { g.fillStyle = '#f2f2f2'; for (const y of [h - 150, h - 110, h - 70]) g.fillRect(0, y, w, 20) }
    if (pants.kind === 'plain' && side === 'front') { g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, 20); g.lineTo(w / 2, h - 50); g.stroke() } // a pressed crease
    if (pants.kind === 'shorts' || pants.kind === 'skirt') { const cut = pants.kind === 'skirt' ? 0.5 : 0.42; g.fillStyle = skin; g.fillRect(0, h * cut, w, h); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, h * cut - 6, w, 6); if (pants.kind === 'skirt') { g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 4; for (let x = 20; x < w; x += 44) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h * cut - 6); g.stroke() } } }
    const sh = pants.shoes ?? shade(c, 0.5); g.fillStyle = sh; g.fillRect(0, h - 58, w, 58); g.fillStyle = pants.sole ?? shade(sh, 0.45); g.fillRect(0, h - 14, w, 14) // the shoe and its sole
    if (side === 'front') { g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(w * 0.25, h - 50, w * 0.5, 8) }
    shadeFace(g, w, h)
  })
  return { front: leg('front'), side: leg('side'), cap: canvas(64, 64, (g, w, h) => { g.fillStyle = pants.sole ?? shade(pants.shoes ?? c, 0.5); g.fillRect(0, 0, w, h) }) }
}

// ---------- the face: a pixel-art decal on the front of the head ----------
// Matched against the faces of the reference short (videos/reference/nn3_MOuxoho/frames/faces/ref-faces.jpg): tall black
// oval eyes, thin mouths, white ring eyes for shock, cyan tears. Everything is rasterised by hand at decal size (no
// smoothing), then scaled up, so the edges show hard pixel steps like a real face decal.
// Positions are in studs from the head's centre (x to the viewer's right, y up); the head is 1.24 across and 1.2 tall.
const FACE_W = 1024, FACE_H = 512, HEAD_R = 0.62, HEAD_H = 1.2, DPX = 100 // decal pixels per stud
const ON_BODY = ['necklace', 'scarf', 'bowtie', 'bag', 'backpack', 'cape', 'wings', 'badge', 'pet'], IN_HAND = ['hammer', 'sword', 'wand', 'phone', 'book', 'balloon', 'lollipop']
/** Everything c.wear() knows, by where it goes. */
export const WEAR = {
  hats: ['hardhat', 'cap', 'tophat', 'fedora', 'cowboy', 'beanie', 'slouchy', 'bucket', 'crown', 'halo', 'hood'],
  head: ['ears', 'bunny', 'horns', 'antlers', 'mask', 'headphones', 'headband', 'bow', 'clips', 'flower'],
  face: ['glasses', 'nerd', 'shades', 'goggles', 'moustache', 'beard'],
  body: ON_BODY.concat('bracelet'),
  hand: IN_HAND,
}
export const WEARABLES = Object.values(WEAR).flat()
export const CLASSIC_FACES = ['neutral', 'smile', 'smirk', 'frown', 'sad', 'angry', 'determined', 'oh', 'talk', 'scream', 'shout', 'scared', 'freezing', 'cry', 'glasses', 'happy', 'sleep', 'grin', 'cute', 'wink', 'love', 'cool', 'worried', 'teeth', 'dizzy', 'epic', 'laugh', 'squint', 'bored', 'cat', 'tongue', 'stare', 'star', 'spiral', 'fang', 'lash', 'buck', 'shy', 'sharp', 'fangs', 'xd', 'shock', 'sweat', 'tear', 'shine', 'mad', 'blank']
const INK = [10, 8, 6], WHITE = [255, 255, 255], CYAN = [53, 214, 245], ICE = [200, 246, 255], PINK = [222, 106, 168], TONGUE = [240, 138, 160], BLUSH = [240, 130, 140]

/** A tiny pixel canvas: shapes are filled pixel by pixel, in stud coordinates. Colour null erases back to skin. */
function pixelPad() {
  const w = Math.round(2 * Math.PI * HEAD_R * DPX), h = Math.round(HEAD_H * DPX), data = new Uint8ClampedArray(w * h * 4)
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; if (c) { data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255 } else data[i + 3] = 0 }
  const PX = (sx) => w / 2 + sx * DPX, PY = (sy) => h / 2 - sy * DPX
  const area = (x0, y0, x1, y1, test, c) => { for (let y = Math.floor(PY(y1)) - 1; y <= Math.ceil(PY(y0)) + 1; y++) for (let x = Math.floor(PX(x0)) - 1; x <= Math.ceil(PX(x1)) + 1; x++) { const sx = (x + 0.5 - w / 2) / DPX, sy = (h / 2 - y - 0.5) / DPX; if (test(sx, sy)) put(x, y, c) } }
  const P = {
    w, h, data,
    ellipse(cx, cy, rx, ry, c) { area(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, c) },
    /** A line or a chain of lines with round ends. pts: [[x, y], ...] */
    line(pts, wd, c) {
      for (let i = 0; i + 1 < pts.length; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9
        area(Math.min(ax, bx) - wd, Math.min(ay, by) - wd, Math.max(ax, bx) + wd, Math.max(ay, by) + wd, (x, y) => { const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)); return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= (wd / 2) ** 2 }, c) }
    },
    /** A curve through three points (start, control, end). */
    curve(a, ctl, b, wd, c) { const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14, u = 1 - t; pts.push([u * u * a[0] + 2 * u * t * ctl[0] + t * t * b[0], u * u * a[1] + 2 * u * t * ctl[1] + t * t * b[1]]) } P.line(pts, wd, c) },
    poly(pts, c) {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
      area(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (x, y) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside } return inside }, c)
    },
    /** A filled shape with an ink outline: draw the ink a little bigger, then the fill. */
    outlined(draw, grow) { draw(grow, INK); draw(0, null) },
  }
  return P
}
/** Faces whose mouth is a plain line or curve: these can lip-sync (the open, yelling and crying mouths keep their shape). */
const LIPSYNC = new Set(['neutral', 'smile', 'smirk', 'frown', 'sad', 'angry', 'determined', 'oh', 'talk', 'freezing', 'happy', 'sleep', 'cute', 'wink', 'love', 'cool', 'worried', 'bored', 'cat', 'stare', 'star', 'spiral', 'lash', 'shy', 'squint'])
/** The talking mouth, in the same pixel style. talk = { level: 1..3 (how open), shape: 'mid' | 'wide' (ee) | 'round' (oo) }. */
function drawTalk(P, talk) {
  P.poly([[-0.34, -0.2], [0.34, -0.2], [0.34, -0.52], [-0.34, -0.52]], null) // wipe the resting mouth
  const k = talk.shape === 'wide' ? 1.32 : talk.shape === 'round' ? 0.6 : 1, y = -0.325
  const rx = [0, 0.075, 0.09, 0.1][talk.level] * k, ry = [0, 0.03, 0.06, 0.098][talk.level] * (talk.shape === 'round' ? 1.15 : talk.shape === 'wide' ? 0.85 : 1)
  P.ellipse(0, y, rx, ry, INK)
  if (talk.level >= 2) P.ellipse(0, y - ry * 0.52, rx * 0.6, ry * 0.36, TONGUE)
  if (talk.level >= 2 && talk.shape === 'wide') P.ellipse(0, y + ry * 0.6, rx * 0.72, ry * 0.2, WHITE) // top teeth on "ee"
}
function drawFace(P, name, talk) {
  const E = 0.165, EY = 0.1, both = (f) => { f(-1); f(1) }
  const eyes = (rx = 0.066, ry = 0.135, y = EY) => both((s) => P.ellipse(s * E, y, rx, ry, INK))
  const ring = (cx, cy, r, pupil = [0, 0], pr = 0.024) => { P.ellipse(cx, cy, r + 0.022, r + 0.022, INK); P.ellipse(cx, cy, r, r, WHITE); P.ellipse(cx + pupil[0], cy + pupil[1], pr, pr, INK) }
  const mouthLine = (hw, y = -0.31, wd = 0.022) => P.line([[-hw, y], [hw, y]], wd, INK)
  /** The open, yelling mouth: a bell that is narrow on top and wide below, with a teeth band under its top edge. */
  const yell = (cy, top, bot, hgt, wave = 0) => {
    const pts = []; for (let i = 0; i <= 12; i++) { const a = Math.PI - (i / 12) * Math.PI; pts.push([Math.cos(a) * top, cy + hgt / 2 - 0.11 + Math.sin(a) * 0.11]) }
    for (let i = 0; i <= 6; i++) { const x = bot - (i / 6) * 2 * bot; pts.push([x, cy - hgt / 2 + (wave ? Math.sin((i / 6) * Math.PI * 3) * wave : 0) - Math.abs(x) * 0.08]) }
    P.poly(pts, INK)
    P.poly(pts.slice(0, 13).map(([x, y]) => [x * 0.8, y - 0.045]).concat(pts.slice(0, 13).reverse().map(([x, y]) => [x * 0.72, y - 0.09])), WHITE)
  }
  switch (name) {
    case 'smile': eyes(); P.curve([-0.18, -0.27], [0, -0.4], [0.18, -0.27], 0.022, INK); break
    case 'smirk': eyes(); P.curve([-0.21, -0.33], [0, -0.4], [0.23, -0.28], 0.022, INK); break
    case 'frown': eyes(0.055, 0.1, 0.08); both((s) => P.curve([s * 0.26, 0.2], [s * 0.18, 0.25], [s * 0.09, 0.235], 0.014, INK)); P.curve([-0.14, -0.34], [0, -0.325], [0.14, -0.34], 0.02, INK); break
    case 'sad': eyes(0.055, 0.1, 0.08); both((s) => P.curve([s * 0.27, 0.19], [s * 0.18, 0.25], [s * 0.08, 0.25], 0.016, INK)); P.curve([-0.15, -0.37], [0, -0.28], [0.15, -0.37], 0.022, INK); break
    case 'angry': // the brows cut the tops of the eyes flat
      eyes(0.068, 0.135)
      both((s) => { P.poly([[s * 0.3, 0.34], [s * 0.03, 0.215], [s * 0.03, 0.4], [s * 0.3, 0.4]], null); P.line([[s * 0.29, 0.3], [s * 0.065, 0.195]], 0.032, INK); P.line([[s * 0.21, 0.325], [s * 0.14, 0.3]], 0.016, INK) })
      P.curve([-0.21, -0.33], [0, -0.4], [0.23, -0.28], 0.022, INK); break
    case 'determined': eyes(); both((s) => P.line([[s * 0.24, 0.3], [s * 0.1, 0.25]], 0.026, INK)); P.ellipse(0, -0.3, 0.15, 0.045, INK); P.ellipse(0, -0.302, 0.125, 0.022, PINK); break
    case 'oh': eyes(); P.ellipse(0, -0.33, 0.055, 0.07, INK); break
    case 'talk': eyes(); P.ellipse(0, -0.31, 0.09, 0.06, INK); P.ellipse(0, -0.33, 0.055, 0.024, TONGUE); break
    case 'scream':
      both((s) => { ring(s * 0.155, 0.14, 0.097, [-0.03, 0.03], 0.026); P.line([[s * 0.27, 0.35], [s * 0.18, 0.3], [s * 0.09, 0.345]], 0.022, INK) })
      yell(-0.27, 0.2, 0.24, 0.46, 0.014); break
    case 'shout':
      both((s) => { ring(s * 0.155, 0.14, 0.088, [0.016, -0.008], 0.024); P.curve([s * 0.28, 0.27], [s * 0.2, 0.36], [s * 0.09, 0.33], 0.02, INK) })
      yell(-0.28, 0.18, 0.215, 0.42, 0.016); break
    case 'scared': both((s) => { ring(s * 0.17, 0.12, 0.075, [0, 0], 0.018); P.curve([s * 0.28, 0.24], [s * 0.2, 0.33], [s * 0.09, 0.32], 0.018, INK) }); P.line([[-0.21, -0.33], [-0.105, -0.29], [0, -0.34], [0.105, -0.29], [0.21, -0.33]], 0.022, INK); break
    case 'freezing': // heavy slanted lids, a cyan tear under each eye
      eyes(0.08, 0.165)
      both((s) => { P.poly([[s * 0.05, 0.36], [s * 0.32, 0.36], [s * 0.32, 0.2], [s * 0.05, 0.245]], null); P.line([[s * 0.095, 0.24], [s * 0.235, 0.215]], 0.034, INK); P.ellipse(s * E, -0.068, 0.062, 0.04, CYAN); P.ellipse(s * E, -0.04, 0.064, 0.032, INK) })
      mouthLine(0.22, -0.33); break
    case 'cry': { // spiky cyan burst eyes, tear streaks, a wide wobbly mouth
      both((s) => {
        const cx = s * 0.235, cy = 0.17, burst = (ro, ri) => { const pts = []; for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2 + 0.2, r = i % 2 ? ri : ro * (0.82 + 0.18 * Math.sin(i * 2.3)); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9]) } return pts }
        P.poly(burst(0.29, 0.16), INK); P.poly(burst(0.26, 0.14), CYAN); P.poly(burst(0.18, 0.1), ICE); P.ellipse(cx, cy, 0.06, 0.06, WHITE)
        P.line([[s * 0.42, 0.0], [s * 0.47, -0.12]], 0.022, CYAN); P.line([[s * 0.36, -0.1], [s * 0.4, -0.2]], 0.02, CYAN)
      })
      const lip = (grow) => { const pts = []; for (let i = 0; i <= 10; i++) pts.push([-0.31 - grow + (i / 10) * (0.62 + 2 * grow), -0.13 + grow + Math.sin((i / 10) * Math.PI) * 0.04]); for (let i = 0; i <= 10; i++) pts.push([0.31 + grow - (i / 10) * (0.62 + 2 * grow), -0.36 - grow + Math.sin((i / 10) * Math.PI * 4) * 0.026]); return pts }
      P.poly(lip(0.022), INK); P.poly(lip(0), WHITE); P.line([[-0.24, -0.25], [0.24, -0.25]], 0.014, INK)
      both((s) => P.curve([s * 0.33, -0.4], [s * 0.22, -0.46], [s * 0.08, -0.43], 0.016, INK)); break
    }
    case 'glasses':
      both((s) => ring(s * 0.235, 0.1, 0.2, [s * -0.04, 0.0], 0.026)); P.line([[-0.03, 0.12], [0.03, 0.12]], 0.022, INK)
      P.ellipse(0.02, -0.37, 0.062, 0.078, INK); P.ellipse(0.02, -0.4, 0.04, 0.04, TONGUE); break
    case 'happy': both((s) => { P.curve([s * E - 0.07, 0.07], [s * E, 0.17], [s * E + 0.07, 0.07], 0.024, INK); P.ellipse(s * 0.3, -0.07, 0.06, 0.035, BLUSH) }); P.curve([-0.14, -0.28], [0, -0.39], [0.14, -0.28], 0.022, INK); break
    case 'sleep': both((s) => P.curve([s * E - 0.07, 0.1], [s * E, 0.05], [s * E + 0.07, 0.1], 0.02, INK)); mouthLine(0.08, -0.32); break
    case 'grin': { // the wide open smile: a big half-moon mouth with a tongue
      eyes(); const pts = [[-0.24, -0.22]]; for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI; pts.push([Math.cos(a) * 0.24, -0.22 + Math.sin(a) * 0.2]) } P.poly(pts, INK); P.ellipse(0, -0.35, 0.11, 0.055, TONGUE); break }
    case 'cute': // big shiny eyes, blush, a small smile
      both((s) => { P.ellipse(s * 0.19, 0.09, 0.095, 0.155, INK); P.ellipse(s * 0.19 + 0.03, 0.15, 0.034, 0.044, WHITE); P.ellipse(s * 0.19 - 0.03, 0.02, 0.018, 0.022, WHITE); P.ellipse(s * 0.33, -0.12, 0.075, 0.04, BLUSH) })
      P.curve([-0.1, -0.28], [0, -0.36], [0.1, -0.28], 0.022, INK); break
    case 'wink': P.ellipse(-E, EY, 0.066, 0.135, INK); P.curve([E - 0.09, EY + 0.02], [E, EY + 0.09], [E + 0.09, EY + 0.02], 0.024, INK); P.curve([-0.18, -0.27], [0.02, -0.41], [0.2, -0.25], 0.022, INK); break
    case 'love': { const RED = [226, 52, 74]; both((s) => { P.ellipse(s * 0.19 - 0.05, 0.14, 0.06, 0.06, RED); P.ellipse(s * 0.19 + 0.05, 0.14, 0.06, 0.06, RED); P.poly([[s * 0.19 - 0.11, 0.12], [s * 0.19 + 0.11, 0.12], [s * 0.19, -0.03]], RED) }); P.curve([-0.16, -0.27], [0, -0.4], [0.16, -0.27], 0.022, INK); break }
    case 'cool': eyes(0.07, 0.12); both((s) => P.poly([[s * 0.28, 0.13], [s * 0.05, 0.13], [s * 0.05, 0.3], [s * 0.28, 0.3]], null)); both((s) => P.line([[s * 0.27, 0.13], [s * 0.06, 0.13]], 0.026, INK)); P.curve([-0.2, -0.32], [0.02, -0.38], [0.22, -0.27], 0.022, INK); break
    case 'worried': eyes(0.06, 0.12, 0.07); both((s) => P.line([[s * 0.28, 0.25], [s * 0.08, 0.33]], 0.02, INK)); P.line([[-0.14, -0.33], [-0.07, -0.3], [0, -0.33], [0.07, -0.3], [0.14, -0.33]], 0.02, INK); P.ellipse(0.4, 0.2, 0.035, 0.055, CYAN); break
    case 'teeth': eyes(0.068, 0.135); both((s) => { P.poly([[s * 0.3, 0.34], [s * 0.03, 0.215], [s * 0.03, 0.4], [s * 0.3, 0.4]], null); P.line([[s * 0.29, 0.3], [s * 0.065, 0.195]], 0.032, INK) }); P.poly([[-0.2, -0.24], [0.2, -0.24], [0.2, -0.4], [-0.2, -0.4]], INK); P.poly([[-0.175, -0.265], [0.175, -0.265], [0.175, -0.375], [-0.175, -0.375]], WHITE); for (const x of [-0.09, 0, 0.09]) P.line([[x, -0.265], [x, -0.375]], 0.012, INK); P.line([[-0.175, -0.32], [0.175, -0.32]], 0.012, INK); break
    case 'epic': { // eyes rolled up, a huge open laugh
      both((s) => ring(s * 0.2, 0.17, 0.115, [0.02, 0.055], 0.05))
      const pts = [[-0.33, -0.1]]; for (let i = 0; i <= 14; i++) { const a = Math.PI + (i / 14) * Math.PI; pts.push([Math.cos(a) * 0.33, -0.1 + Math.sin(a) * 0.36]) } P.poly(pts, INK)
      P.poly([[-0.27, -0.13], [0.27, -0.13], [0.25, -0.2], [-0.25, -0.2]], WHITE); P.ellipse(0, -0.36, 0.17, 0.075, TONGUE); break }
    case 'laugh': { // eyes shut in arcs, blush, an open laugh
      both((s) => { P.curve([s * E - 0.1, EY - 0.02], [s * E, EY + 0.12], [s * E + 0.1, EY - 0.02], 0.028, INK); P.ellipse(s * 0.33, -0.08, 0.07, 0.035, BLUSH) })
      const pts = [[-0.2, -0.2]]; for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI; pts.push([Math.cos(a) * 0.2, -0.2 + Math.sin(a) * 0.22]) } P.poly(pts, INK); P.ellipse(0, -0.35, 0.1, 0.05, TONGUE); break }
    case 'squint': both((s) => P.line([[s * E + s * 0.09, EY + 0.08], [s * E - s * 0.07, EY], [s * E + s * 0.09, EY - 0.08]], 0.03, INK)); P.line([[-0.06, -0.35], [0, -0.3], [0.06, -0.35]], 0.022, INK); break
    case 'bored': eyes(0.08, 0.1, 0.07); both((s) => { P.poly([[s * 0.29, 0.09], [s * 0.04, 0.09], [s * 0.04, 0.3], [s * 0.29, 0.3]], null); P.line([[s * 0.27, 0.09], [s * 0.06, 0.09]], 0.026, INK) }); mouthLine(0.15, -0.33); break
    case 'cat': eyes(0.05, 0.1); P.curve([-0.13, -0.28], [-0.065, -0.38], [0, -0.29], 0.022, INK); P.curve([0, -0.29], [0.065, -0.38], [0.13, -0.28], 0.022, INK); break
    case 'tongue': both((s) => { P.curve([s * E - 0.09, EY - 0.02], [s * E, EY + 0.1], [s * E + 0.09, EY - 0.02], 0.026, INK); P.ellipse(s * 0.33, -0.08, 0.07, 0.035, BLUSH) }); P.ellipse(0, -0.36, 0.075, 0.09, INK); P.ellipse(0, -0.36, 0.055, 0.07, TONGUE); P.curve([-0.12, -0.28], [0, -0.33], [0.12, -0.28], 0.022, INK); break
    case 'stare': both((s) => ring(s * 0.2, 0.1, 0.115, [0, 0], 0.04)); break
    case 'star': { const st = (cx, cy, r) => { const pts = []; for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 + Math.PI / 2, rr = i % 2 ? r * 0.42 : r; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]) } return pts }
      both((s) => { P.ellipse(s * 0.19, 0.09, 0.1, 0.14, INK); P.poly(st(s * 0.19, 0.09, 0.085), WHITE); P.ellipse(s * 0.33, -0.12, 0.075, 0.04, BLUSH) }); P.curve([-0.08, -0.29], [0, -0.35], [0.08, -0.29], 0.022, INK); break }
    case 'spiral': both((s) => { P.ellipse(s * 0.2, 0.1, 0.135, 0.135, INK); P.ellipse(s * 0.2, 0.1, 0.115, 0.115, WHITE); const pts = []; for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 5, r = 0.1 * (i / 40); pts.push([s * 0.2 + Math.cos(a) * r, 0.1 + Math.sin(a) * r]) } P.line(pts, 0.018, INK) }); P.line([[-0.1, -0.33], [-0.03, -0.3], [0.03, -0.34], [0.1, -0.31]], 0.02, INK); break
    case 'fang': eyes(0.07, 0.12); both((s) => { P.poly([[s * 0.28, 0.13], [s * 0.05, 0.13], [s * 0.05, 0.3], [s * 0.28, 0.3]], null); P.line([[s * 0.27, 0.15], [s * 0.06, 0.11]], 0.026, INK) }); P.curve([-0.2, -0.32], [0.02, -0.38], [0.22, -0.26], 0.022, INK); P.poly([[0.1, -0.31], [0.18, -0.29], [0.15, -0.4]], INK); P.poly([[0.115, -0.325], [0.165, -0.31], [0.148, -0.375]], WHITE); break
    case 'lash': both((s) => { P.ellipse(s * 0.19, 0.08, 0.09, 0.125, INK); P.ellipse(s * 0.19 + 0.03, 0.13, 0.03, 0.04, WHITE); P.line([[s * 0.27, 0.17], [s * 0.345, 0.24]], 0.02, INK); P.line([[s * 0.285, 0.11], [s * 0.36, 0.14]], 0.02, INK); P.curve([s * 0.3, 0.3], [s * 0.19, 0.34], [s * 0.09, 0.3], 0.014, INK); P.ellipse(s * 0.33, -0.12, 0.075, 0.04, BLUSH) }); P.curve([-0.06, -0.3], [0, -0.34], [0.06, -0.3], 0.02, INK); break
    case 'buck': eyes(); P.curve([-0.2, -0.26], [0, -0.4], [0.2, -0.26], 0.022, INK); P.poly([[-0.085, -0.31], [0.085, -0.31], [0.085, -0.45], [-0.085, -0.45]], INK); P.poly([[-0.068, -0.325], [-0.008, -0.325], [-0.008, -0.435], [-0.068, -0.435]], WHITE); P.poly([[0.008, -0.325], [0.068, -0.325], [0.068, -0.435], [0.008, -0.435]], WHITE); break
    case 'shy': both((s) => { P.curve([s * E - 0.09, EY + 0.02], [s * E, EY - 0.03], [s * E + 0.09, EY + 0.02], 0.024, INK); P.ellipse(s * 0.3, -0.1, 0.1, 0.05, BLUSH) }); P.ellipse(0, -0.3, 0.025, 0.02, INK); break
    case 'sharp': { // narrow glaring eyes and a wide grin full of pointed teeth
      both((s) => { P.poly([[s * 0.32, 0.22], [s * 0.05, 0.07], [s * 0.2, 0.02], [s * 0.32, 0.12]], INK); P.poly([[s * 0.28, 0.17], [s * 0.11, 0.08], [s * 0.2, 0.06]], WHITE) })
      const top = [], bot = []; for (let i = 0; i <= 12; i++) { const x = -0.34 + (i / 12) * 0.68, sag = -0.07 * (1 - (x / 0.34) ** 2); top.push([x, -0.2 + sag]); bot.push([x, -0.36 + sag * 1.8]) }
      P.poly(top.concat(bot.slice().reverse()), INK)
      for (let i = 0; i < 12; i++) { const a = top[i], b = top[i + 1], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.075]; P.poly([[a[0] + 0.006, a[1] - 0.012], [b[0] - 0.006, b[1] - 0.012], m], WHITE); const c = bot[i], e = bot[i + 1]; if (i % 2) P.poly([[c[0] + 0.006, c[1] + 0.012], [e[0] - 0.006, e[1] + 0.012], [(c[0] + e[0]) / 2, (c[1] + e[1]) / 2 + 0.06]], WHITE) } break }
    case 'fangs': { // eyes shut with a lash, striped blush, an open mouth with two fangs
      both((s) => { P.curve([s * E - 0.1, EY + 0.02], [s * E, EY + 0.13], [s * E + 0.1, EY + 0.02], 0.028, INK); P.line([[s * E + s * 0.1, EY + 0.02], [s * E + s * 0.15, EY + 0.08]], 0.02, INK); for (const k of [0, 1, 2]) P.line([[s * 0.27 + k * 0.045, -0.06], [s * 0.27 + k * 0.045 - 0.03, -0.13]], 0.016, BLUSH) })
      const pts = [[-0.2, -0.18]]; for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI; pts.push([Math.cos(a) * 0.2, -0.18 + Math.sin(a) * 0.26]) } P.poly(pts, INK); P.ellipse(0, -0.36, 0.12, 0.06, TONGUE)
      for (const sx of [-1, 1]) P.poly([[sx * 0.15, -0.19], [sx * 0.07, -0.19], [sx * 0.11, -0.29]], WHITE); break }
    case 'xd': { // eyes squeezed shut, laughing with the tongue showing
      both((s) => { P.line([[s * E + s * 0.1, EY + 0.09], [s * E - s * 0.08, EY], [s * E + s * 0.1, EY - 0.09]], 0.032, INK); for (const k of [0, 1]) P.line([[s * 0.3 + k * 0.045, -0.1], [s * 0.3 + k * 0.045 - 0.03, -0.16]], 0.016, BLUSH) })
      const pts = [[-0.17, -0.2]]; for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI; pts.push([Math.cos(a) * 0.17, -0.2 + Math.sin(a) * 0.22]) } P.poly(pts, INK); P.ellipse(0, -0.35, 0.1, 0.055, TONGUE); break }
    case 'shock': { // tiny dot eyes, a big red round open mouth (O)
      both((s) => P.ellipse(s * 0.19, 0.1, 0.045, 0.06, INK)); P.ellipse(0, -0.3, 0.1, 0.12, INK); P.ellipse(0, -0.3, 0.078, 0.098, [205, 32, 38]); break }
    case 'sweat': { // worried eyes, a flat mouth, a blue sweat drop by the brow
      eyes(0.07, 0.12); both((s) => P.line([[s * 0.1, 0.27], [s * 0.3, 0.23]], 0.022, INK)); P.line([[-0.09, -0.31], [0.09, -0.31]], 0.022, INK)
      P.ellipse(0.42, 0.18, 0.05, 0.065, [120, 205, 245]); P.poly([[0.385, 0.2], [0.455, 0.2], [0.42, 0.29]], [120, 205, 245]); P.ellipse(0.43, 0.17, 0.015, 0.02, WHITE); break }
    case 'tear': { // eyes squeezed sad, one tear running down
      both((s) => P.curve([s * E - 0.09, EY], [s * E, EY + 0.06], [s * E + 0.09, EY], 0.026, INK)); P.curve([-0.12, -0.36], [0, -0.28], [0.12, -0.36], 0.022, INK)
      P.line([[0.2, EY - 0.04], [0.21, -0.14], [0.2, -0.24]], 0.032, CYAN); P.ellipse(0.2, -0.26, 0.035, 0.04, CYAN); break }
    case 'shine': { // big glossy eyes with two highlights, a small smile (the cute look of the viral shorts)
      both((s) => { P.ellipse(s * 0.19, 0.08, 0.1, 0.135, INK); P.ellipse(s * 0.19 + 0.035, 0.14, 0.04, 0.05, WHITE); P.ellipse(s * 0.19 - 0.03, 0.02, 0.018, 0.022, WHITE); P.ellipse(s * 0.34, -0.11, 0.07, 0.035, BLUSH) })
      P.curve([-0.07, -0.28], [0, -0.33], [0.07, -0.28], 0.022, INK); break }
    case 'mad': { // angry brows over a wide toothy grin
      eyes(0.06, 0.1); both((s) => P.line([[s * 0.08, 0.24], [s * 0.3, 0.3]], 0.03, INK))
      const top = [], bot = []; for (let i = 0; i <= 10; i++) { const x = -0.28 + (i / 10) * 0.56, sag = -0.05 * (1 - (x / 0.28) ** 2); top.push([x, -0.22 + sag]); bot.push([x, -0.34 + sag * 1.6]) }
      P.poly(top.concat(bot.slice().reverse()), INK); P.poly(top.map(([x, y]) => [x * 0.9, y - 0.012]).concat(top.slice().reverse().map(([x, y]) => [x * 0.9, y - 0.06])), WHITE); break }
    case 'blank': break
    case 'dizzy': both((s) => { P.line([[s * E - 0.07, EY + 0.07], [s * E + 0.07, EY - 0.07]], 0.026, INK); P.line([[s * E - 0.07, EY - 0.07], [s * E + 0.07, EY + 0.07]], 0.026, INK) }); P.ellipse(0, -0.33, 0.07, 0.06, INK); break
    default: eyes(); mouthLine(0.11, -0.31) // neutral
  }
  if (talk && LIPSYNC.has(name)) drawTalk(P, talk)
}
/** The whole head wrap: skin with the face in the middle, scaled up from decal size without smoothing. */
function faceTexture(skin, name, talk) {
  const P = pixelPad(); drawFace(P, name, talk)
  const small = document.createElement('canvas'); small.width = P.w; small.height = P.h
  small.getContext('2d').putImageData(new ImageData(P.data, P.w, P.h), 0, 0)
  return canvas(FACE_W, FACE_H, (g, w, h) => { g.fillStyle = skin; g.fillRect(0, 0, w, h); g.imageSmoothingEnabled = false; g.drawImage(small, 0, 0, w, h) })
}
/** The classic head: a cylinder with rounded top and bottom edges. */
function headGeometry() {
  const r = HEAD_R, h = HEAD_H, c = 0.2, pts = [new T.Vector2(0, -h / 2)]
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2); pts.push(new T.Vector2(r - c + Math.cos(a) * c, -h / 2 + c + Math.sin(a) * c)) }
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); pts.push(new T.Vector2(r - c + Math.cos(a) * c, h / 2 - c + Math.sin(a) * c)) }
  pts.push(new T.Vector2(0, h / 2))
  const g = new T.LatheGeometry(pts, 56), pos = g.attributes.position, uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) + h / 2) / h) // the picture maps straight by height
  g.computeVertexNormals()
  return g
}

// ---------- hair: a sculpted cap plus locks, with a strand texture ----------
/** A point on the head: polar angle from the top, angle around (0 = the face, 180 = the back), distance out from the scalp. */
const onHead = (polar, around, out = 0) => { const a = D(polar), b = D(around), r = 0.63 + out; return new T.Vector3(Math.sin(a) * Math.sin(b) * r, Math.cos(a) * r * 0.97 + 0.02, Math.sin(a) * Math.cos(b) * r) }
/** Hair styles. Angles are degrees from the top of the head; front / side / back are how far down the hairline goes. */
const HAIR = {
  //         hairline: front side back | lock tips | thickness | quiff: lift, where (deg around, 0 = front) | combed to the side | locks across | groove depth
  swept: { front: 50, side: 104, back: 112, tips: 9, thick: 0.075, quiff: 0.23, quiffAt: -14, sweep: 0.35, clumps: 10, relief: 1, wave: 1, down: 128 },
  messy: { front: 56, side: 104, back: 114, tips: 16, thick: 0.1, quiff: 0.16, quiffAt: 8, sweep: -0.2, clumps: 12, relief: 1.4, wave: 2.2, down: 132 },
  long: { panel: true, front: 50, side: 116, back: 124, tips: 8, thick: 0.08, quiff: 0.1, quiffAt: 0, sweep: 0.2, clumps: 11, relief: 0.9, wave: 1.2, down: 134 },
  bun: { front: 54, side: 100, back: 104, tips: 5, thick: 0.06, quiff: 0.04, quiffAt: 0, sweep: 0, clumps: 10, relief: 0.8, wave: 0.6, down: 122 },
}
/**
 * hair: { style: 'swept' | 'messy' | 'long' | 'bun' | 'none', color, seed? }
 * One solid shape wrapped over the head, like sculpted game hair: combed locks run from the front hairline over the
 * crown to the back, rounded on top with sharp grooves between them; the hairline ends in pointed lock tips; grooves
 * are shaded darker. It closes onto the scalp at the hairline, so no skin shows through.
 */
function buildHair(hair) {
  const g = new T.Group()
  if (!hair || hair.style === 'none') return g
  const st = HAIR[hair.style] ?? HAIR.swept, r = rng(hair.seed ?? 7), base = new T.Color(hair.color ?? '#6a5444'), ph0 = r() * 6
  const NT = 120, NP = 260, pos = [], col = [], idx = []
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
  // the head's surface along a direction: a boxy rounded shape, 0.62 out and 0.6 up
  const headR = (th) => 1 / (Math.abs(Math.sin(th) / 0.62) ** 5 + Math.abs(Math.cos(th) / 0.6) ** 5) ** 0.2
  const sw = st.sweep, cw = Math.cos(D(38)), sw2 = Math.sin(D(38)) // the whorl sits 38 degrees behind the top
  /** The hair at one direction: where the hairline is there, and the surface point and shade. */
  const at = (th, ph) => {
    const d = [Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)]
    // the locks radiate from a whorl at the back of the crown: forward over the top, down the sides, down the back
    const az = Math.atan2(d[0], d[2] * cw + d[1] * sw2) + sw, fromWhorl = Math.acos(Math.max(-1, Math.min(1, d[1] * cw - d[2] * sw2)))
    const wob = st.wave * (0.05 * Math.sin(fromWhorl * 4 + az * 3 + ph0) + 0.025 * Math.sin(fromWhorl * 9 + az * 7 + ph0 * 2))
    const calm = sm(D(6), D(32), fromWhorl) // no grooves right at the whorl, where the locks would pinch together
    const lockN = 1 - calm * (1 - Math.abs(Math.sin((az + wob) * st.clumps * 0.5 + ph0))), fine = Math.abs(Math.sin((az + wob) * st.clumps * 1.7 + 1.3))
    const aph = Math.abs(ph)
    const line = D(st.front) + (D(st.side) - D(st.front)) * sm(D(30), D(60), aph) + (D(st.back) - D(st.side)) * sm(D(105), D(150), aph)
    const edge = Math.min(D(st.down) - 0.03, line + D(st.tips) * lockN ** 1.6) // a lock's middle reaches lower than the grooves beside it: pointed tips
    const fade = sm(0, D(15), edge - th) // the hair thins down to the scalp at the hairline
    const top = Math.max(0, Math.cos(th))
    const quiff = st.quiff * Math.exp(-(((th - D(40)) / D(27)) ** 2)) * Math.exp(-(((ph - D(st.quiffAt)) / D(62)) ** 2))
    const hang = th > D(118) ? 0.62 / Math.max(0.2, Math.sin(th)) : headR(th) // below the head, long hair hangs straight down
    const R = hang + (st.thick + 0.07 * top * top + quiff) * fade + 0.012 + (0.07 * Math.sqrt(lockN) + 0 * fine) * fade * st.relief
    return { edge, p: [d[0] * R, d[1] * R, d[2] * R], sh: 0.76 + 0.32 * Math.sqrt(lockN) } // a few big soft clumps: grooves a little darker (fine ripples read as brushed metal)
  }
  for (let i = 0; i <= NT; i++) for (let k = 0; k <= NP; k++) {
    const th = (i / NT) * D(st.down), ph = (k / NP) * 2 * Math.PI - Math.PI // ph = 0 is the face
    let h = at(th, ph)
    // past the hairline: pull the point back onto it, so the edge is a clean line instead of grid steps
    if (th > h.edge) { let e = h.edge; for (let n = 0; n < 3; n++) e = at(e, ph).edge; h = at(Math.min(th, e), ph) }
    pos.push(...h.p); col.push(base.r * h.sh, base.g * h.sh, base.b * h.sh)
  }
  for (let i = 0; i < NT; i++) for (let k = 0; k < NP; k++) { const a = i * (NP + 1) + k, b = a + 1, c = a + NP + 1, e = c + 1; idx.push(a, c, b, b, c, e) }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals()
  const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: T.DoubleSide })
  const shell = new T.Mesh(geo, m); shell.castShadow = true; g.add(shell)
  /** A loose strand: a tapered tube along a path (points in studs from the head's centre). */
  const tuft = (pts, r0, parent = g) => {
    const curve = new T.CatmullRomCurve3(pts), N = 12, RS = 7, p = [], c = [], ix = [], P0 = new T.Vector3(), tan = new T.Vector3(), nx = new T.Vector3(), ny = new T.Vector3()
    for (let i = 0; i <= N; i++) { const u = i / N, rad = r0 * (1 - u * 0.92); curve.getPoint(u, P0); curve.getTangent(u, tan); nx.copy(P0).normalize().cross(tan).normalize(); ny.crossVectors(tan, nx).normalize()
      for (let k = 0; k < RS; k++) { const a = (k / RS) * Math.PI * 2; p.push(P0.x + (nx.x * Math.cos(a) * 1.5 + ny.x * Math.sin(a) * 0.7) * rad, P0.y + (nx.y * Math.cos(a) * 1.5 + ny.y * Math.sin(a) * 0.7) * rad, P0.z + (nx.z * Math.cos(a) * 1.5 + ny.z * Math.sin(a) * 0.7) * rad); const sh = 0.8 + 0.25 * Math.abs(Math.cos(a)); c.push(base.r * sh, base.g * sh, base.b * sh) } }
    for (let i = 0; i < N; i++) for (let k = 0; k < RS; k++) { const a = i * RS + k, b = i * RS + ((k + 1) % RS); ix.push(a, a + RS, b, b, a + RS, b + RS) }
    const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.Float32BufferAttribute(p, 3)); tg.setAttribute('color', new T.Float32BufferAttribute(c, 3)); tg.setIndex(ix); tg.computeVertexNormals()
    const mesh = new T.Mesh(tg, m); mesh.castShadow = true; parent.add(mesh)
  }
  if (st.panel) {
    // long hair: a wide panel lying on the back, from the nape to the middle of the back, with lock tips at the bottom.
    // It is attached to the body (not the head), so it never swings through the chest when the head nods.
    const NX = 48, NY = 16, pp = [], pc = [], pi = []
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const v = j / NY, a = (i / NX) * 2 - 1, lock = Math.abs(Math.sin(a * Math.PI * 4.5 + ph0)), hw = 0.7 - 0.05 * v
      const y = -0.15 - v * (1.5 + 0.13 * lock), z = -(0.74 - 0.12 * v) - 0.08 * Math.cos((a * Math.PI) / 2) - 0.035 * Math.sqrt(lock) + 0.3 * Math.abs(a) ** 3
      pp.push(a * hw, y, z); const sh = 0.66 + 0.46 * Math.sqrt(lock); pc.push(base.r * sh, base.g * sh, base.b * sh)
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const q = j * (NX + 1) + i; pi.push(q, q + NX + 1, q + 1, q + 1, q + NX + 1, q + NX + 2) }
    const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.Float32BufferAttribute(pp, 3)); pg.setAttribute('color', new T.Float32BufferAttribute(pc, 3)); pg.setIndex(pi); pg.computeVertexNormals()
    const panel = new T.Mesh(pg, m); panel.castShadow = true; g.userData.back = new T.Group(); g.userData.back.add(panel)
  }
  if (hair.style === 'swept') for (const [a0, dir] of [[-22, -1], [26, 1]]) tuft([onHead(48, a0, 0.1), onHead(50, a0 + dir * 9, 0.2), onHead(64, a0 + dir * 20, 0.15), onHead(78, a0 + dir * 30, 0.07)], 0.05)
  if (hair.style === 'messy') for (let i = 0; i < 9; i++) { const pol = 12 + r() * 60, ar = r() * 360; tuft([onHead(pol, ar, 0.1), onHead(pol - 6, ar + 12, 0.3 + r() * 0.1), onHead(pol + 8, ar + 30, 0.24)], 0.06) }
  if (hair.style === 'bun') {
    const bg = new T.IcosahedronGeometry(0.33, 4), bp = bg.attributes.position, bc = [], v = new T.Vector3()
    for (let i = 0; i < bp.count; i++) { v.fromBufferAttribute(bp, i); const k = Math.sqrt(Math.abs(Math.sin(Math.atan2(v.x, v.z) * 6 + v.y * 9))); v.multiplyScalar(1 + 0.09 * k); bp.setXYZ(i, v.x, v.y, v.z); const sh = 0.68 + 0.42 * k; bc.push(base.r * sh, base.g * sh, base.b * sh) }
    bg.setAttribute('color', new T.Float32BufferAttribute(bc, 3)); bg.computeVertexNormals()
    const bun = new T.Mesh(bg, m); bun.position.set(0, 0.62, -0.46); bun.scale.set(1.1, 0.9, 1); bun.castShadow = true; g.add(bun)
    for (const sd of [-1, 1]) tuft([onHead(54, sd * 44, 0.06), onHead(80, sd * 58, 0.11), onHead(112, sd * 54, 0.08), onHead(138, sd * 46, 0.1)], 0.05)
  }
  return g
}

// ---------- the avatar ----------
/**
 * o: { name, skin?: '#c09670', top: {kind, color, inner?, print?}, pants: {kind, color}, hair: {style, color}, scale?, seed? }
 * Returns { root, parts, name, setFace(name), speak(mouth), pose({ armL, armR, legL, legR, head, torso }), walk(phase, amp?), idle(t) }.
 * Angles are degrees. An arm or leg is [swing, out?] (swing forward is positive); head is [nod, turn, tilt].
 */
export function Classic(o) {
  const skin = o.skin ?? '#c09670', root = new T.Group(); root.scale.setScalar(o.scale ?? 1)
  const tt = topTextures({ seed: o.seed, ...(o.top ?? { kind: 'tee', color: '#c41e2c' }) }, skin), pt = pantsTextures({ seed: (o.seed ?? 1) + 1, ...(o.pants ?? { kind: 'jeans' }) }, skin)
  const box = (w, h, d, mats) => { const m = new T.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.12), mats); // rounded edges catch the light, like moulded plastic
    m.castShadow = true; m.receiveShadow = true; return m }
  const parts = {}
  // legs: pivot at the hip
  const hip = {}
  for (const [s, x] of [['L', 0.5], ['R', -0.5]]) {
    const g = new T.Group(); g.position.set(x, 2, 0); root.add(g); hip[s] = g
    const leg = box(0.99, 2, 0.99, [mat(pt.side), mat(pt.side), mat(pt.cap), mat(pt.cap), mat(pt.front), mat(pt.side)]); leg.position.y = -1; g.add(leg); parts['leg' + s] = leg
    const sole = new T.Mesh(new T.BoxGeometry(0.9, 0.06, 0.9), new T.MeshBasicMaterial({ visible: false })); sole.position.y = -1.97; g.add(sole); parts['sole' + s] = sole
  }
  // body: torso, arms and head turn together around the waist
  const body = new T.Group(); body.position.y = 2; root.add(body)
  const torso = box(2, 2, 1, [mat(tt.plain), mat(tt.plain), mat(tt.cap), mat(tt.cap), mat(tt.front), mat(tt.back)]); torso.position.y = 1; body.add(torso); parts.torso = torso
  const sh = {}
  for (const [s, x] of [['L', 1.5], ['R', -1.5]]) {
    const g = new T.Group(); g.position.set(x, 1.5, 0); body.add(g); sh[s] = g
    const arm = box(0.99, 2, 0.99, [mat(tt.arm), mat(tt.arm), mat(tt.cap), flat(skin), mat(tt.arm), mat(tt.arm)]); arm.position.y = -0.5; g.add(arm); parts['arm' + s] = arm
  }
  const neck = new T.Group(); neck.position.y = 2; body.add(neck)
  const faces = {}, headMat = new T.MeshStandardMaterial({ roughness: 0.72 })
  let talkKey = ''
  const show = () => {
    const talk = talkKey && LIPSYNC.has(C.face) ? { level: Number(talkKey[0]), shape: talkKey.slice(1) } : null, k = C.face + (talk ? '|' + talkKey : '')
    faces[k] ??= faceTexture(skin, C.face, talk); headMat.map = faces[k]; headMat.needsUpdate = true
  }
  const head = new T.Mesh(headGeometry(), headMat); head.rotation.y = Math.PI; head.position.y = 0.56; head.castShadow = true; neck.add(head); parts.head = head
  const hairG = buildHair(o.hair); hairG.position.y = 0.56; neck.add(hairG)
  if (hairG.userData.back) { hairG.userData.back.position.y = 2.56; body.add(hairG.userData.back) }
  const gm = (color, rough = 0.66) => new T.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 0.08, clearcoatRoughness: 0.6 })
  const cyl = (rt, rb, h, color, seg = 28) => { const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg), gm(color)); m.castShadow = true; return m }
  const blk = (w, h, d, color) => { const m = new T.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.05, h / 3)), gm(color)); m.castShadow = true; return m }
  /** Things to wear. The head's centre is the origin, +z is the face, the top of the head is y 0.6. */
  const GEAR = {
    hardhat: (c = '#f2c230') => { const g = new T.Group(), dome = new T.Mesh(new T.SphereGeometry(0.7, 28, 14, 0, 6.283, 0, 1.571), gm(c)); dome.scale.y = 0.78; dome.position.y = 0.42; dome.castShadow = true; const brim = cyl(0.8, 0.8, 0.08, c); brim.position.set(0, 0.42, 0.12); const rib = blk(0.16, 0.5, 1.3, c); rib.position.y = 0.7; g.add(dome, brim, rib); return g },
    cap: (c = '#d8322c') => { const g = new T.Group(), dome = new T.Mesh(new T.SphereGeometry(0.68, 28, 14, 0, 6.283, 0, 1.571), gm(c)); dome.scale.y = 0.7; dome.position.y = 0.4; dome.castShadow = true; const bill = blk(0.9, 0.07, 0.7, c); bill.position.set(0, 0.44, 0.86); g.add(dome, bill); return g },
    tophat: (c = '#1c1c22', band = '#d8322c') => { const g = new T.Group(), brim = cyl(1.0, 1.0, 0.08, c), top = cyl(0.62, 0.62, 1.0, c), b = cyl(0.64, 0.64, 0.18, band); brim.position.y = 0.6; top.position.y = 1.12; b.position.y = 0.74; g.add(brim, top, b); return g },
    fedora: (c = '#b01818', band = '#1c1c22') => { const g = new T.Group(), brim = cyl(1.05, 1.05, 0.08, c), top = cyl(0.6, 0.7, 0.55, c), b = cyl(0.71, 0.71, 0.14, band); brim.position.y = 0.6; top.position.y = 0.9; b.position.y = 0.72; g.add(brim, top, b); return g },
    cowboy: (c = '#a9794a', band = '#5d381a') => { const g = new T.Group(), brim = cyl(1.3, 1.3, 0.08, c), top = cyl(0.52, 0.68, 0.7, c), b = cyl(0.69, 0.69, 0.12, band); brim.position.y = 0.6; brim.scale.z = 0.8; top.position.y = 0.96; b.position.y = 0.7; g.add(brim, top, b); return g },
    beanie: (c = '#2f7de8') => { const g = new T.Group(), dome = new T.Mesh(new T.SphereGeometry(0.69, 28, 14, 0, 6.283, 0, 1.571), gm(c, 0.9)); dome.position.y = 0.3; dome.castShadow = true; const cuff = cyl(0.7, 0.7, 0.22, c); cuff.position.y = 0.36; const pom = new T.Mesh(new T.SphereGeometry(0.2, 14, 10), gm('#ffffff', 0.9)); pom.position.y = 1.02; g.add(dome, cuff, pom); return g },
    crown: (c = '#f2c230') => { const g = new T.Group(), ring = cyl(0.6, 0.6, 0.3, c); ring.position.y = 0.72; g.add(ring); for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283, p = new T.Mesh(new T.ConeGeometry(0.14, 0.34, 4), gm(c)); p.position.set(Math.sin(a) * 0.5, 1.02, Math.cos(a) * 0.5); g.add(p) } return g },
    glasses: (c = '#f2c230', lens = '#ffe9a0') => { const g = new T.Group(); for (const sx of [-1, 1]) { const rim = new T.Mesh(new T.TorusGeometry(0.2, 0.035, 8, 24), gm(c, 0.3)), l = new T.Mesh(new T.CircleGeometry(0.19, 24), new T.MeshBasicMaterial({ color: lens })); rim.position.set(sx * 0.25, 0.14, 0.64); l.position.set(sx * 0.25, 0.14, 0.635); g.add(rim, l) } const br = blk(0.14, 0.04, 0.04, c); br.position.set(0, 0.16, 0.64); g.add(br); return g },
    shades: (c = '#16161c') => { const g = new T.Group(), bar = blk(1.0, 0.24, 0.06, c); bar.position.set(0, 0.14, 0.63); g.add(bar); return g },
    headphones: (c = '#22242c', pad = '#d8322c') => { const g = new T.Group(), band = new T.Mesh(new T.TorusGeometry(0.68, 0.06, 8, 28, Math.PI), gm(c)); band.position.y = 0.1; g.add(band); for (const sx of [-1, 1]) { const cup = cyl(0.24, 0.24, 0.16, pad, 18); cup.rotation.z = Math.PI / 2; cup.position.set(sx * 0.7, 0.08, 0); g.add(cup) } return g },
    antlers: (c = '#8a5a2c') => { const g = new T.Group(); for (const sx of [-1, 1]) { const a = blk(0.1, 0.8, 0.1, c); a.position.set(sx * 0.36, 0.98, 0); a.rotation.z = -sx * 0.4; const b = blk(0.08, 0.4, 0.08, c); b.position.set(sx * 0.62, 1.12, 0); b.rotation.z = -sx * 1.1; g.add(a, b) } return g },
    // ---- ears and animal heads
    ears: (c = '#3a3a40', inner = '#f6b7d6') => { const g = new T.Group(); for (const sx of [-1, 1]) { const e = new T.Mesh(new T.ConeGeometry(0.2, 0.46, 4), gm(c)); e.position.set(sx * 0.36, 0.78, 0); e.rotation.set(0, Math.PI / 4, -sx * 0.25); e.castShadow = true; const i = new T.Mesh(new T.ConeGeometry(0.11, 0.3, 4), gm(inner)); i.position.set(sx * 0.36, 0.76, 0.07); i.rotation.copy(e.rotation); g.add(e, i) } return g },
    bunny: (c = '#f4f4f4', inner = '#f6b7d6') => { const g = new T.Group(); for (const sx of [-1, 1]) { const e = blk(0.2, 0.9, 0.12, c); e.position.set(sx * 0.26, 1.04, 0); e.rotation.z = -sx * 0.16; const i = blk(0.1, 0.66, 0.02, inner); i.position.set(sx * 0.26, 1.04, 0.07); i.rotation.z = -sx * 0.16; g.add(e, i) } return g },
    horns: (c = '#e8e2d2') => { const g = new T.Group(); for (const sx of [-1, 1]) { const e = new T.Mesh(new T.ConeGeometry(0.17, 0.72, 10), gm(c)); e.position.set(sx * 0.44, 0.9, 0.1); e.rotation.z = -sx * 0.5; e.castShadow = true; g.add(e) } return g },
    mask: (c = '#6b6f7a', muzzle = '#e8e2d2') => { // an animal head: a hood over the head, ears, a muzzle and a nose (wolf, raccoon, panda, fox by colour)
      const g = new T.Group(), hood = cyl(0.68, 0.68, 1.26, c); hood.position.y = 0.02; g.add(hood)
      for (const sx of [-1, 1]) { const e = new T.Mesh(new T.ConeGeometry(0.22, 0.46, 4), gm(c)); e.position.set(sx * 0.4, 0.84, 0); e.rotation.set(0, Math.PI / 4, -sx * 0.25); e.castShadow = true; const eye = blk(0.2, 0.16, 0.04, '#16161c'); eye.position.set(sx * 0.27, 0.16, 0.67); const gl = blk(0.07, 0.07, 0.05, '#ffffff'); gl.position.set(sx * 0.3, 0.19, 0.68); g.add(e, eye, gl) }
      const mz = blk(0.52, 0.36, 0.3, muzzle); mz.position.set(0, -0.2, 0.74); const nose = blk(0.2, 0.13, 0.1, '#16161c'); nose.position.set(0, -0.06, 0.92); g.add(mz, nose)
      for (const sx of [-1, 1]) { const ck = new T.Mesh(new T.ConeGeometry(0.2, 0.42, 4), gm(muzzle)); ck.rotation.z = sx * 1.9; ck.position.set(sx * 0.66, -0.26, 0.2); const inr = new T.Mesh(new T.ConeGeometry(0.12, 0.3, 4), gm(muzzle)); inr.position.set(sx * 0.4, 0.82, 0.08); inr.rotation.set(0, Math.PI / 4, -sx * 0.25); g.add(ck, inr) } return g },
    // ---- more for the head and face
    nerd: (c = '#16161c') => { const g = new T.Group(); for (const sx of [-1, 1]) { const top = blk(0.4, 0.05, 0.05, c), bot = blk(0.4, 0.05, 0.05, c), l = blk(0.05, 0.28, 0.05, c), r2 = blk(0.05, 0.28, 0.05, c); top.position.set(sx * 0.26, 0.28, 0.64); bot.position.set(sx * 0.26, 0.02, 0.64); l.position.set(sx * 0.07, 0.15, 0.64); r2.position.set(sx * 0.45, 0.15, 0.64); g.add(top, bot, l, r2) } const br = blk(0.14, 0.05, 0.05, c); br.position.set(0, 0.2, 0.64); g.add(br); return g },
    goggles: (c = '#5a5d63', lens = '#9ad4ff') => { const g = new T.Group(), strap = cyl(0.66, 0.66, 0.16, '#22242c'); strap.position.y = 0.42; g.add(strap); for (const sx of [-1, 1]) { const rim = cyl(0.2, 0.2, 0.12, c, 18), l = cyl(0.15, 0.15, 0.13, lens, 18); rim.rotation.x = l.rotation.x = Math.PI / 2; rim.position.set(sx * 0.24, 0.42, 0.62); l.position.set(sx * 0.24, 0.42, 0.63); g.add(rim, l) } return g },
    clips: (c = '#ff8fc8') => { const g = new T.Group(); for (const sx of [-1, 1]) for (const k of [-1, 1]) { const h = new T.Mesh(new T.SphereGeometry(0.1, 10, 8), gm(c)); h.position.set(sx * 0.5 + k * 0.07, 0.42, 0.42); g.add(h) } return g },
    headband: (c = '#b5651d') => { const g = new T.Group(), b = new T.Mesh(new T.TorusGeometry(0.64, 0.09, 8, 28, Math.PI), gm(c, 0.8)); b.position.y = 0.12; g.add(b); return g },
    flower: (c = '#ff5fb0', mid = '#ffd21f') => { const g = new T.Group(); for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.283, pt = new T.Mesh(new T.SphereGeometry(0.11, 10, 8), gm(c)); pt.position.set(0.5 + Math.cos(a) * 0.13, 0.5 + Math.sin(a) * 0.13, 0.4); g.add(pt) } const m = new T.Mesh(new T.SphereGeometry(0.09, 10, 8), gm(mid)); m.position.set(0.5, 0.5, 0.46); g.add(m); return g },
    halo: (c = '#ffe14a') => { const g = new T.Group(), h = new T.Mesh(new T.TorusGeometry(0.42, 0.05, 8, 28), new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6 })); h.rotation.x = Math.PI / 2; h.position.y = 1.05; g.add(h); return g },
    hood: (c = '#16161c') => { const g = new T.Group(), top = new T.Mesh(new T.CylinderGeometry(0.66, 0.66, 0.66, 28), gm(c, 0.8)), cap = new T.Mesh(new T.SphereGeometry(0.66, 28, 10, 0, 6.283, 0, 1.571), gm(c, 0.8)); top.position.y = 0.3; cap.position.y = 0.5; cap.scale.y = 0.3; top.castShadow = true; g.add(top, cap); return g }, // the top half of the head covered, mouth showing: wear it with the 'sharp' or 'fangs' face
    slouchy: (c = '#a8322c') => { const g = new T.Group(), dome = new T.Mesh(new T.SphereGeometry(0.72, 28, 14, 0, 6.283, 0, 1.75), gm(c, 0.9)); dome.position.set(0, 0.34, -0.12); dome.scale.set(1, 0.95, 1.12); dome.castShadow = true; const cuff = cyl(0.7, 0.7, 0.2, c); cuff.position.y = 0.38; g.add(dome, cuff); return g },
    bucket: (c = '#22242c') => { const g = new T.Group(), top = cyl(0.6, 0.7, 0.5, c), brim = cyl(0.72, 1.02, 0.26, c); top.position.y = 0.82; brim.position.y = 0.5; g.add(top, brim); return g },
    moustache: (c = '#231d1c') => { const g = new T.Group(); for (const sx of [-1, 1]) { const m = blk(0.26, 0.1, 0.06, c); m.position.set(sx * 0.14, -0.16, 0.64); m.rotation.z = -sx * 0.25; g.add(m) } return g },
    beard: (c = '#231d1c') => { const g = new T.Group(), b = new T.Mesh(new T.CylinderGeometry(0.65, 0.56, 0.3, 28, 1, false, -1.75, 3.5), gm(c, 0.9)); b.position.y = -0.56; b.castShadow = true; g.add(b); for (const sx of [-1, 1]) { const sd = blk(0.07, 0.5, 0.3, c); sd.position.set(sx * 0.62, -0.22, 0.12); g.add(sd) } return g }, // a chin beard with sideburns; the mouth stays clear
    // ---- neck, body, shoulder, wrist (built around the body: the torso is x -1..1, y 0..2, z -0.5..0.5)
    necklace: (c = '#cfd4dc', gem = '#6fc7e8') => { const g = new T.Group(); for (let i = 0; i < 11; i++) { const a = (i / 10 - 0.5) * 1.5, b = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), gm(c, 0.25)); b.position.set(Math.sin(a) * 0.55, 1.9 - Math.cos(a) * 0.42 + 0.14, 0.53); g.add(b) } const p = new T.Mesh(new T.OctahedronGeometry(0.13), gm(gem, 0.2)); p.position.set(0, 1.5, 0.56); g.add(p); return g },
    scarf: (c = '#d8322c') => { const g = new T.Group(), w = cyl(0.72, 0.78, 0.32, c); w.position.y = 2.02; const t = blk(0.34, 0.9, 0.12, c); t.position.set(0.34, 1.5, 0.56); g.add(w, t); return g },
    bowtie: (c = '#d8322c') => { const g = new T.Group(); for (const sx of [-1, 1]) { const w = new T.Mesh(new T.ConeGeometry(0.16, 0.3, 4), gm(c)); w.rotation.z = sx * Math.PI / 2; w.position.set(sx * 0.16, 1.82, 0.56); g.add(w) } return g },
    bag: (c = '#8a5a2c', strap = '#5d381a') => { const g = new T.Group(), b = blk(0.7, 0.56, 0.3, c); b.position.set(0.86, 0.5, 0.56); const fl = blk(0.72, 0.22, 0.32, strap); fl.position.set(0.86, 0.7, 0.56); const st = blk(0.09, 2.5, 0.05, strap); st.position.set(0, 1.3, 0.53); st.rotation.z = 0.72; const sb = blk(0.09, 2.5, 0.05, strap); sb.position.set(0, 1.3, -0.53); sb.rotation.z = 0.72; g.add(b, fl, st, sb); return g },
    backpack: (c = '#2f7de8', trim = '#22242c') => { const g = new T.Group(), b = blk(1.3, 1.5, 0.5, c); b.position.set(0, 1.05, -0.76); const pk = blk(0.9, 0.6, 0.16, trim); pk.position.set(0, 0.72, -1.04); g.add(b, pk); for (const sx of [-1, 1]) { const st = blk(0.16, 1.5, 0.06, trim); st.position.set(sx * 0.56, 1.15, 0.53); g.add(st) } return g },
    cape: (c = '#c40808') => { const g = new T.Group(), k = blk(1.9, 2.9, 0.08, c); k.position.set(0, 0.55, -0.62); k.rotation.x = 0.1; const col = blk(2.04, 0.2, 1.1, c); col.position.y = 1.96; g.add(k, col); return g },
    wings: (c = '#f4f4f4') => { const g = new T.Group(); for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) { const len = 2.3 - i * 0.26, ang = 1.05 - i * 0.3, f = new T.Mesh(new RoundedBoxGeometry(len, 0.42, 0.07, 2, 0.03), gm(i % 2 ? c : shade(c, 0.9))); f.castShadow = true; f.position.set(sx * (0.35 + Math.cos(ang) * len * 0.5), 1.5 + Math.sin(ang) * len * 0.5, -0.62 - i * 0.015); f.rotation.z = sx * ang; g.add(f) } return g },
    badge: (c = '#f2c230') => { const g = new T.Group(), b = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.05, 6), gm(c, 0.25)); b.rotation.x = Math.PI / 2; b.position.set(0.52, 1.5, 0.53); g.add(b); return g },
    pet: (c = '#e8792c', belly = '#f4f4f4') => { const g = new T.Group(), b = blk(0.46, 0.4, 0.6, c); b.position.set(1.22, 2.28, 0); const h = blk(0.42, 0.38, 0.4, c); h.position.set(1.22, 2.62, 0.3); const mz = blk(0.2, 0.16, 0.2, belly); mz.position.set(1.22, 2.54, 0.56); const tl = blk(0.18, 0.18, 0.56, c); tl.position.set(1.22, 2.4, -0.5); tl.rotation.x = -0.6; g.add(b, h, mz, tl); for (const sx of [-1, 1]) { const e = new T.Mesh(new T.ConeGeometry(0.09, 0.22, 4), gm(c)); e.position.set(1.22 + sx * 0.13, 2.9, 0.26); const eye = blk(0.06, 0.07, 0.03, '#16161c'); eye.position.set(1.22 + sx * 0.1, 2.68, 0.51); g.add(e, eye) } return g },
    bracelet: (c = '#d9b46a') => { const g = new T.Group(), b = new T.Mesh(new T.TorusGeometry(0.56, 0.07, 8, 4), gm(c, 0.3)); b.rotation.set(Math.PI / 2, 0, Math.PI / 4); b.position.y = -0.62; g.add(b); return g },
    // ---- things to hold (in the right hand)
    hammer: (c = '#8a5a2c', head = '#8d93a3') => { const g = new T.Group(), h = blk(0.14, 1.3, 0.14, c); h.position.y = 0.3; const hd = blk(0.7, 0.34, 0.34, head); hd.position.y = 1.0; g.add(h, hd); return g },
    sword: (c = '#cfd4dc', grip = '#8a5a2c') => { const g = new T.Group(), b = blk(0.16, 1.9, 0.05, c); b.position.y = 1.1; const gd = blk(0.6, 0.1, 0.14, '#f2c230'); gd.position.y = 0.14; const gp = blk(0.12, 0.4, 0.12, grip); gp.position.y = -0.1; g.add(b, gd, gp); return g },
    wand: (c = '#22242c', tip = '#ffe14a') => { const g = new T.Group(), b = blk(0.08, 1.2, 0.08, c); b.position.y = 0.4; const s2 = new T.Mesh(new T.OctahedronGeometry(0.16), new T.MeshStandardMaterial({ color: tip, emissive: tip, emissiveIntensity: 1.5 })); s2.position.y = 1.1; g.add(b, s2); return g },
    phone: (c = '#22242c', screen = '#9ad4ff') => { const g = new T.Group(), b = blk(0.4, 0.74, 0.06, c); b.position.y = 0.22; const sc = new T.Mesh(new T.PlaneGeometry(0.32, 0.6), new T.MeshBasicMaterial({ color: screen })); sc.position.set(0, 0.22, 0.04); g.add(b, sc); return g },
    book: (c = '#2e9c6a') => { const g = new T.Group(), b = blk(0.62, 0.8, 0.16, c); b.position.y = 0.2; const pg = blk(0.56, 0.74, 0.12, '#f4f1e8'); pg.position.set(0.03, 0.2, 0); g.add(pg, b); b.scale.set(1, 1, 1.2); return g },
    balloon: (c = '#e8392c') => { const g = new T.Group(), s2 = new T.Mesh(new T.SphereGeometry(0.6, 20, 14), gm(c, 0.25)); s2.scale.y = 1.15; s2.position.y = 3.0; s2.castShadow = true; const st = blk(0.03, 2.4, 0.03, '#f4f4f4'); st.position.y = 1.2; g.add(s2, st); return g },
    lollipop: (c = '#ff5fb0') => { const g = new T.Group(), st = blk(0.06, 0.9, 0.06, '#f4f4f4'); st.position.y = 0.3; const s2 = cyl(0.3, 0.3, 0.1, c, 20); s2.rotation.x = Math.PI / 2; s2.position.y = 0.9; g.add(st, s2); return g },
    bow: (c = '#ff5fb0') => { const g = new T.Group(); for (const sx of [-1, 1]) { const w = new T.Mesh(new T.ConeGeometry(0.22, 0.4, 4), gm(c)); w.rotation.z = sx * Math.PI / 2; w.position.set(sx * 0.22, 0.72, 0.1); g.add(w) } return g },
  }
  const C = { joints: { sh, hip },
    /** Put something on, hold something, or add a pet: any name in WEARABLES. Colours are optional, e.g. wear('mask', '#e8792c', '#f4f4f4') for a fox head. */
    wear(kind, ...colors) { const mk = GEAR[kind]; if (!mk) throw new Error(`wear: unknown "${kind}". Use ${Object.keys(GEAR).join(', ')}.`); const g = mk(...colors)
      if (ON_BODY.includes(kind)) body.add(g); else if (kind === 'bracelet') parts.armL.add(g); else if (IN_HAND.includes(kind)) { g.scale.setScalar(1.5); g.position.set(0, -0.9, 0.5); g.rotation.x = Math.PI / 2; parts.armR.add(g) } else { g.position.y = 0.56; neck.add(g) }
      return g },
    root, parts, name: o.name ?? 'someone', standing: true, airborne: false, allow: [], face: null,
    setFace(name) { if (name !== C.face) { C.face = name; show() } },
    /**
     * Lip-sync. m = { open, wide, round } (0..1, from mouthAt() in lipsync.js) while this character is speaking, or null.
     * The mouth snaps to a few pixel shapes, so the face is redrawn only when it really changes.
     */
    speak(m) {
      const level = !m || m.open < 0.12 ? 0 : m.open < 0.4 ? 1 : m.open < 0.7 ? 2 : 3
      const key = level ? `${level}${m.wide > 0.5 ? 'wide' : m.round > 0.2 ? 'round' : 'mid'}` : ''
      if (key !== talkKey) { talkKey = key; show() }
    },
    pose(p = {}) {
      const set = (g, a) => { if (a) g.rotation.set(-D(a[0] ?? 0), 0, D(a[1] ?? 0)) }
      set(sh.L, p.armL); set(sh.R, p.armR && [p.armR[0], -(p.armR[1] ?? 0)]); set(hip.L, p.legL); set(hip.R, p.legR && [p.legR[0], -(p.legR[1] ?? 0)])
      // an arm lifted sideways slides out a little, so its top corner doesn't cut into the torso
      for (const [g, sx] of [[sh.L, 1], [sh.R, -1]]) g.position.x = sx * (1.5 + 0.56 * Math.abs(Math.sin(g.rotation.z)))
      if (p.head) neck.rotation.set(D(p.head[0] ?? 0), D(p.head[1] ?? 0), D(p.head[2] ?? 0))
      if (p.torso) body.rotation.set(D(p.torso[0] ?? 0), D(p.torso[1] ?? 0), D(p.torso[2] ?? 0))
    },
    walk(phase, amp = 34) { C.walking = true; const a = Math.sin(phase) * amp; C.pose({ armL: [-a], armR: [a], legL: [a], legR: [-a] }) },
    idle(t) { const b = Math.sin(t * 1.7 + (o.seed ?? 0)) * 1.4; C.pose({ armL: [b], armR: [-b], head: [0, Math.sin(t * 0.9 + (o.seed ?? 0)) * 4, 0] }) },
  }
  C.setFace('neutral')
  return C
}

// ---------- random people ----------
const SKINS = ['#f0c39a', '#e6b98f', '#d3ab88', '#c59a74', '#b98b68', '#8a6248', '#6b4a36', '#f4f4f4', '#f5cd30', '#f5cd30', '#b9bcc2', '#7fbf6a', '#6fc7e8']
const CLOTH = ['#c40808', '#0d69ac', '#2e9c6a', '#f2b233', '#7d5bd6', '#f07a1a', '#e2574c', '#19b6a6', '#ff5fb0', '#3d6fd6', '#5a5d63', '#1c1c22', '#f4f4f4', '#8a5a2c', '#2f5fa8', '#a8404c']
const LEGS = ['#1c2a4a', '#22242c', '#3a3340', '#4b974b', '#5a5f6a', '#6b4a34', '#a8404c', '#2b2f3c', '#3b3526']
const HAIRC = ['#231d1c', '#3a2620', '#5b4636', '#b5651d', '#e2491f', '#e9d18a', '#8d8f96', '#c9562a', '#1f1c20']
/**
 * A person nobody designed: someone(seed) builds a character whose skin, outfit, colours, hair, hat and shoes all come
 * from the seed, so a crowd never repeats and no two videos share a face in the street. Any number works as a seed;
 * the same seed always gives the same person. overrides: any Classic option to force (scale, name, top...).
 * Returns the character; c.look holds what was picked.
 */
export function someone(seed, overrides = {}) {
  const r = rng(seed * 31 + 7), pick = (a) => a[Math.floor(r() * a.length)]
  const kind = pick(['tee', 'tee', 'hoodie', 'hoodie', 'jacket', 'zip', 'zip', 'denim', 'plaid', 'suit', 'vest', 'uniform', 'letter', 'stripes', 'stripes'])
  const color = pick(CLOTH), inner = pick(['#f4f4f4', '#f4f4f4', '#1c1c22', pick(CLOTH)])
  const top = { kind, color, inner, print: 'none', stripes: r() < 0.5, text: 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'[Math.floor(r() * 33)], ink: pick(CLOTH), tie: pick(CLOTH) }
  const pants = { kind: pick(['jeans', 'jeans', 'plain', 'plain', 'plain', 'stripe', 'shorts', 'skirt']), color: pick(LEGS), shoes: pick(['#f2f2f2', '#22242c', '#d8322c', '#6b4a34', undefined]), sole: pick(['#22242c', '#f2f2f2', undefined]) }
  const hatOnly = r() < 0.3, hair = hatOnly ? { style: 'none' } : { style: pick(['swept', 'messy', 'long', 'bun', 'messy', 'swept']), color: pick(HAIRC), seed: Math.floor(r() * 99) }
  const look = { name: 'someone' + seed, skin: pick(SKINS), top, pants, hair, scale: 0.86 + r() * 0.26, seed, ...overrides }
  const c = Classic(look), worn = []
  if (hatOnly || r() < 0.18) { const h = pick(['cap', 'beanie', 'hardhat', 'fedora', 'cowboy', 'tophat', 'cap', 'beanie']); if (look.hair.style === 'none' || h === 'cap' || h === 'beanie') { c.wear(h, pick(CLOTH)); worn.push(h) } }
  if (r() < 0.22) { const g = pick(WEAR.face.concat('headphones', 'bow', 'clips', 'flower')); c.wear(g); worn.push(g) }
  if (r() < 0.1 && !worn.length) { const g = pick(['ears', 'bunny', 'headband']); c.wear(g); worn.push(g) }
  if (r() < 0.3) { const g = pick(['necklace', 'scarf', 'bag', 'backpack', 'badge', 'bowtie', 'bracelet']); c.wear(g, pick(CLOTH)); worn.push(g) }
  c.look = { ...look, worn }
  return c
}

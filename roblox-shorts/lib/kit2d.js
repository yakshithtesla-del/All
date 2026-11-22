// 2D building blocks. Scenes describe WHAT to draw with shapes + roles;
// the active style decides HOW it looks (ink lines, paper shadows, pixels...).
//
// A shape is a function that adds a path to a canvas context.
// A role is a palette key: sky, sky2, ground, ground2, main, accent, skin, dark, light, extra.
// Any CSS color also works as a role.

export const shapes = {
  circle: (x, y, r) => (c) => c.arc(x, y, Math.max(0, r), 0, Math.PI * 2),
  ellipse: (x, y, rx, ry, rot = 0) => (c) => c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, Math.PI * 2),
  rect: (x, y, w, h, r = 0) => (c) => (r && c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h)),
  poly: (pts) => (c) => { c.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) c.lineTo(p[0], p[1]); c.closePath() },
  /** Open polyline, for stroke(). */
  line: (pts) => (c) => { c.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) c.lineTo(p[0], p[1]) },
  /** Star / burst with n points. */
  star: (x, y, r1, r2, n = 5, rot = -Math.PI / 2) => (c) => {
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? r2 : r1, a = rot + (i * Math.PI) / n
      i ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    }
    c.closePath()
  },
  /** Free path: pass (ctx) => { ctx.moveTo(...); ctx.quadraticCurveTo(...) }. */
  path: (fn) => fn,
}

/** Plain painter: flat fill, plain strokes, bold text. Styles build their own on top of this idea. */
export function basicPainter(ctx, P, { font = "900 SIZEpx 'Arial Black', Arial, sans-serif" } = {}) {
  const col = (role) => P[role] ?? role
  return {
    ctx, P,
    fill(shape, role = 'main') { ctx.beginPath(); shape(ctx); ctx.fillStyle = col(role); ctx.fill() },
    stroke(shape, width, role = 'dark') {
      ctx.beginPath(); shape(ctx)
      ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.strokeStyle = col(role); ctx.stroke()
    },
    text(str, x, y, size, role = 'dark', align = 'center') {
      ctx.font = font.replace('SIZE', Math.round(size)); ctx.textAlign = align; ctx.textBaseline = 'middle'
      ctx.fillStyle = col(role); ctx.fillText(str, x, y)
    },
  }
}

/**
 * A simple reusable mascot. Same pieces in every style, so a style switch reads as the same story.
 * (x, y) = feet, s = height in px. arm: -1..1 waves the right arm. look: -1..1 eyes. mouth: 0..1 open.
 */
export function drawCharacter(paint, { x, y, s, arm = 0, look = 0, mouth = 0, blink = false, body = 'main', skin = 'skin' }) {
  const h = s
  const sh = y - 0.52 * h
  paint.stroke(shapes.line([[x - 0.1 * h, y - 0.12 * h], [x - 0.1 * h, y]]), 0.07 * h, 'dark')
  paint.stroke(shapes.line([[x + 0.1 * h, y - 0.12 * h], [x + 0.1 * h, y]]), 0.07 * h, 'dark')
  paint.stroke(shapes.line([[x - 0.2 * h, sh], [x - 0.33 * h, sh + 0.18 * h]]), 0.06 * h, 'dark')
  const a = -0.6 - arm * 0.9
  paint.stroke(shapes.line([[x + 0.2 * h, sh], [x + 0.2 * h + Math.cos(a) * 0.2 * h, sh + Math.sin(a) * 0.2 * h]]), 0.06 * h, 'dark')
  paint.fill(shapes.rect(x - 0.22 * h, y - 0.62 * h, 0.44 * h, 0.52 * h, 0.16 * h), body)
  const hy = y - 0.78 * h
  paint.fill(shapes.circle(x, hy, 0.2 * h), skin)
  const ex = look * 0.035 * h
  if (blink) {
    paint.fill(shapes.rect(x - 0.1 * h + ex, hy - 0.025 * h, 0.06 * h, 0.012 * h), 'dark')
    paint.fill(shapes.rect(x + 0.04 * h + ex, hy - 0.025 * h, 0.06 * h, 0.012 * h), 'dark')
  } else {
    paint.fill(shapes.circle(x - 0.07 * h + ex, hy - 0.02 * h, 0.028 * h), 'dark')
    paint.fill(shapes.circle(x + 0.07 * h + ex, hy - 0.02 * h, 0.028 * h), 'dark')
  }
  paint.fill(shapes.ellipse(x, hy + 0.08 * h, 0.05 * h, 0.012 * h + mouth * 0.035 * h), 'dark')
}

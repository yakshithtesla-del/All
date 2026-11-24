// The engine: reads story.json (+ voice/timing.json), loads one style + one scene per beat,
// and draws any moment `t` on demand. render.mjs calls window.frame(t) for every frame.
//
// Open http://localhost:PORT/?play (node render.mjs preview) to watch it live with sound.

import * as util from './lib/util.js'
import { shapes, drawCharacter, basicPainter } from './lib/kit2d.js'
import { makeCharacter } from './lib/kit3d.js'

const SIZES = { vertical: [1080, 1920], wide: [1920, 1080], square: [1080, 1080] }

async function json(url) {
  const r = await fetch(url, { cache: 'no-store' })
  return r.ok ? r.json() : null
}

function chunkWords(words, max = 3) {
  const out = []
  let cur = []
  for (const w of words) {
    cur.push(w)
    if (cur.length >= max || /[.,!?;:]$/.test(w.word)) { out.push(cur); cur = [] }
  }
  if (cur.length) out.push(cur)
  return out
}

function drawCaptions(ctx, b, raw, W, H, story) {
  const chunks = b.chunks
  const i = chunks.findIndex((c, k) => raw >= c[0].start && (k === chunks.length - 1 || raw < chunks[k + 1][0].start))
  if (i < 0) return
  const chunk = chunks[i]
  const size = Math.round((W < H ? W : H) * (story.captionSize ?? 0.075))
  ctx.save()
  ctx.font = `900 ${size}px 'Arial Black', 'Helvetica Neue', Arial, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.lineJoin = 'round'
  // In this town: optional caption case, key words (story.captionKeys + beat.keys) in ALL CAPS and their own colour,
  // no active-word colour (captionActive: false), a thinner edge (captionStroke) and a soft shadow (captionShadow).
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9']/g, '')
  const keys = new Set([...(story.captionKeys ?? []), ...(b.keys ?? [])].map(norm))
  const isKey = chunk.map((w) => keys.has(norm(w.word)))
  const cased = (t) => story.captionCase === 'upper' ? t.toUpperCase() : story.captionCase === 'lower' ? t.toLowerCase() : t
  const punct = (t) => story.captionPunct === false ? t.replace(/[.,;:"\u201c\u201d]/g, '') : t
  const text = chunk.map((w, k) => punct(isKey[k] ? w.word.toUpperCase() : cased(w.word)))
  const space = ctx.measureText(' ').width
  const widths = text.map((t) => ctx.measureText(t).width)
  const total = widths.reduce((a, b2) => a + b2, 0) + space * (text.length - 1)
  let x = (W - total) / 2
  const y = H * (story.captionY ?? (W < H ? 0.74 : 0.86))
  chunk.forEach((w, k) => {
    const next = chunk[k + 1]
    const active = raw >= w.start && raw < (next ? next.start : w.end + 0.25)
    const sh = story.captionShadow ?? 0
    if (sh) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = size * sh; ctx.shadowOffsetY = size * sh * 0.4; ctx.fillStyle = '#000'; ctx.fillText(text[k], x, y); ctx.restore() }
    ctx.lineWidth = size * (story.captionStroke ?? 0.2)
    ctx.strokeStyle = '#000'
    if (ctx.lineWidth > 0) ctx.strokeText(text[k], x, y)
    ctx.fillStyle = isKey[k] ? (story.captionKeyColor ?? '#E8452C') : active && story.captionActive !== false ? (story.captionColor ?? '#FFE600') : '#FFFFFF'
    ctx.fillText(text[k], x, y)
    x += widths[k] + space
  })
  ctx.restore()
}

async function main() {
  const story = await json('story.json')
  if (!story) throw new Error('story.json not found')
  const timing = await json('voice/timing.json')
  if (timing && timing.lines.length !== story.beats.length) {
    throw new Error(`voice/timing.json has ${timing.lines.length} lines but story.json has ${story.beats.length} beats. Re-run the voice step.`)
  }
  const [W, H] = SIZES[story.format ?? 'vertical'] ?? SIZES.vertical
  const fps = story.fps ?? 30
  const out = document.getElementById('out')
  out.width = W; out.height = H
  const ctx = out.getContext('2d')

  let cursor = 0
  const beats = story.beats.map((b, i) => {
    const L = timing?.lines?.[i]
    let start, dur
    if (L) {
      start = L.start
      const next = timing.lines[i + 1]
      dur = (next ? next.start : timing.duration) - start
    } else {
      start = cursor
      dur = b.seconds ?? 2.5
    }
    cursor = start + dur
    const words = (L?.words ?? []).map((w) => ({ ...w, start: w.start - start, end: w.end - start }))
    return { ...b, index: i, start, dur, words, chunks: chunkWords(words, story.captionWords ?? 3) }
  })
  const DUR = cursor

  for (const b of beats) {
    if (!b.style) throw new Error(`beat ${b.index + 1} has no "style"`)
    b.styleMod = (await import(`./styles/${b.style}.js`)).default
    b.sceneMod = (await import(`./scenes/${b.scene ?? 'beat' + (b.index + 1)}.js`)).default
  }

  let gl = null
  async function getGL() {
    if (!gl) {
      const THREE = await import('three')
      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
      renderer.setPixelRatio(1)
      renderer.setSize(W, H, false)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      gl = { THREE, renderer, canvas }
    }
    return gl
  }

  // Real models (downloaded with `node assets.mjs get <slug>` into assets/). Cached per slug, cloned per use.
  const models = new Map()
  async function loadModel(THREE, slug) {
    if (!models.has(slug)) {
      models.set(slug, (async () => {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
        try { return await new GLTFLoader().loadAsync(`assets/${slug}.glb`) }
        catch { throw new Error(`Model "${slug}" isn't downloaded. Run: node assets.mjs get ${slug}`) }
      })())
    }
    const gltf = await models.get(slug)
    const { clone } = await import('three/addons/utils/SkeletonUtils.js')
    const obj = clone(gltf.scene)
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    obj.userData.clips = gltf.animations
    return obj
  }
  /** Scale a model so it's `height` units tall and stands on y = 0. */
  function fit(THREE, obj, height) {
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3())
    obj.scale.multiplyScalar(height / (size.y || 1))
    const b2 = new THREE.Box3().setFromObject(obj)
    obj.position.y -= b2.min.y
    return obj
  }
  /** Play a model's built-in animation. Call .at(t) in update(): frame-exact for any t. */
  function play(THREE, obj, name, { speed = 1 } = {}) {
    const clips = obj.userData.clips ?? []
    const clip = THREE.AnimationClip.findByName(clips, name) ?? clips[0]
    const mixer = new THREE.AnimationMixer(obj)
    if (clip) mixer.clipAction(clip).play()
    return { mixer, clip, at: (t) => mixer.setTime(t * speed) }
  }

  const beatAt = (t) => { for (let i = beats.length - 1; i >= 0; i--) if (t >= beats[i].start) return beats[i]; return beats[0] }

  async function draw(t) {
    window.FK_ISSUES = [] // a scene that skips report() must not inherit the last frame's collisions
    t = util.clamp(t, 0, DUR - 1e-6)
    const b = beatAt(t)
    const st = b.styleMod
    const raw = t - b.start
    const lt = st.poseFps ? Math.floor(raw * st.poseFps) / st.poseFps : raw
    const env = {
      W, H, t: lt, raw, dur: b.dur, p: util.clamp(lt / b.dur), globalT: t,
      beat: b, index: b.index, line: b.line, words: b.words, story,
      util, ease: util.ease, shapes, drawCharacter, rand: util.rng(b.index * 7919 + 1),
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.filter = 'none'
    ctx.imageSmoothingEnabled = true
    ctx.clearRect(0, 0, W, H)

    if (st.kind === '3d') {
      const g = await getGL()
      if (!b.three) {
        const scene = new g.THREE.Scene()
        const camera = new g.THREE.PerspectiveCamera(40, W / H, 0.1, 500)
        camera.position.set(0, 2, 8)
        camera.lookAt(0, 1, 0)
        const kit = st.kit(g.THREE)
        st.setup?.({ THREE: g.THREE, scene, camera, renderer: g.renderer, kit, W, H, beat: b })
        const ctx3 = {
          ...env, THREE: g.THREE, scene, camera, kit, makeCharacter: (o) => makeCharacter(g.THREE, kit, o),
          load: (slug) => loadModel(g.THREE, slug), fit: (obj, h) => fit(g.THREE, obj, h), play: (obj, name, o) => play(g.THREE, obj, name, o),
          tint: (obj, color) => { const c = new g.THREE.Color(color); obj.traverse((o) => { if (o.isMesh) { if (!o.userData.ownMat) { o.material = o.material.clone(); o.userData.ownMat = true } o.material.color.copy(c) } }); return obj },
        }
        const state = (await b.sceneMod.create?.(ctx3)) ?? {}
        b.three = { scene, camera, kit, state }
      }
      const { scene, camera, kit, state } = b.three
      b.sceneMod.update?.({ ...env, THREE: g.THREE, scene, camera, kit, state })
      if (b.sceneMod.render) b.sceneMod.render({ THREE: g.THREE, renderer: g.renderer, scene, camera, state, W, H }) // a scene may run its own passes (depth of field)
      else g.renderer.render(scene, camera)
      ctx.drawImage(g.canvas, 0, 0, W, H)
      st.post?.(ctx, env)
      // Optional 2D layer on top of a 3D beat: labels, numbers, arrows.
      if (b.sceneMod.overlay) b.sceneMod.overlay({ ...env, ctx, state, camera, paint: basicPainter(ctx, st.palette ?? {}) })
    } else {
      st.render(ctx, env, (paint) => b.sceneMod.draw({ ...env, paint }))
    }

    if (story.captions !== false && b.sceneMod.captions !== false && b.chunks.length) drawCaptions(ctx, b, raw, W, H, story)
  }

  window.SIZE = [W, H]
  window.DUR = DUR
  window.FPS = fps
  window.BEATS = beats.map((b) => ({ index: b.index, style: b.style, scene: b.scene ?? `beat${b.index + 1}`, start: b.start, dur: b.dur, line: b.line }))
  window.seek = draw
  window.frame = async (t) => { await draw(t); return out.toDataURL('image/jpeg', 0.92).split(',')[1] }
  await draw(0)
  window.READY = true

  if (new URLSearchParams(location.search).has('play')) {
    const audio = timing ? new Audio('voice/voice.mp3') : null
    let t0 = null
    document.body.addEventListener('click', () => { t0 = performance.now(); audio?.play() })
    console.log('Click the page to play.')
    const loop = async () => {
      if (t0 !== null) {
        const t = (performance.now() - t0) / 1000
        if (t >= DUR) { t0 = null; audio?.pause(); if (audio) audio.currentTime = 0 } else await draw(t)
      }
      requestAnimationFrame(loop)
    }
    loop()
  }
}

main().catch((e) => { window.FAILED = String(e?.stack ?? e); console.error(e) })

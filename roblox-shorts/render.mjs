// node render.mjs check                 list beats, styles and timing
// node render.mjs stills                one picture per beat (middle of each) + stills/sheet.jpg
// node render.mjs stills 1.5,4,9        pictures at those seconds of the whole video
// node render.mjs video                 out/video.mp4 with the full soundtrack (voice + a score + SFX + beds, made in code by
//                                        audio/soundtrack.mjs; story.sound sets it up). SFX are always in; music can be off
//                                        (sound.music: false) or a track the person owns (story.music).
// node render.mjs preview               serve the project, open the printed URL to watch it live
// node render.mjs history              the recent videos' places, themes and seeds (pick others for a new one)
// options for video: --until <sec> (render only the start, e.g. a preview loop), --out <file>, --silent (no audio)
// Every command checks the place plan (story.json "places") and the history; video refuses until both are clean.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { checkPlaces, checkRepeat, addHistory, printHistory } from './places-check.mjs'
import { ffmpegPath } from './lib/ffmpeg.mjs'
const FF = await ffmpegPath().catch(() => 'ffmpeg')   // the computer's ffmpeg, else the bundled copy (node setup.mjs)

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.glb': 'model/gltf-binary' }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const file = path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname))
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end() }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(buf)
  })
})

const cmd = process.argv[2] ?? 'help'
const hasFfmpeg = () => spawnSync(FF, ['-version']).status === 0

if (cmd === 'help') {
  console.log('Usage: node render.mjs check | stills [t1,t2,...] | video | preview | history')
  process.exit(0)
}
if (cmd === 'history') { printHistory(); process.exit(0) }

if (cmd === 'preview') {
  server.listen(Number(process.env.PORT ?? 5173), () => {
    console.log(`Open http://localhost:${server.address().port}/?play and click the page to play. Ctrl+C to stop.`)
  })
} else {
  let puppeteer
  try { puppeteer = (await import('puppeteer')).default } catch { console.error('Missing packages. Run: npm i'); process.exit(1) }
  await new Promise((r) => server.listen(0, '127.0.0.1', r))   // 127.0.0.1, not localhost: on Windows localhost can resolve to IPv6 (::1) and the page load aborts
  const gl = process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader'
  let browser
  try { browser = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--enable-webgl', '--ignore-gpu-blocklist', gl, '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] }) }
  catch (e) { console.error(`FAIL: the rendering browser could not start (${String(e.message).split('\n')[0]}). Run: node setup.mjs   (it installs the browser), then run the same command again.`); process.exit(1) }
  const page = await browser.newPage()
  // Missing optional files (no voice yet, favicon) show up as 404s: not worth reporting.
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) console.error('[page]', m.text()); else if (m.text().startsWith('MOVED:')) console.log(m.text()) })   // MOVED: someone placed inside a prop (game.js)
  page.on('pageerror', (e) => console.error('[page]', e.message))
  for (let tries = 1; ; tries++) {   // a page load aborted by a firewall or antivirus scan is retried, then explained
    try { await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'load', timeout: 120000 }); break }
    catch (e) { if (tries >= 4) { console.error(`FAIL: the renderer could not open its local page (${e.message}). Allow Node.js through the firewall/antivirus (it only talks to this computer: 127.0.0.1), then run the same command again.`); throw e }
      console.log(`page load failed (${e.message.split('\n')[0]}), retrying ${tries}/3...`); await new Promise((r) => setTimeout(r, 1500 * tries)) }
  }
  await page.waitForFunction(() => window.READY || window.FAILED, { timeout: 120000 })
  const failed = await page.evaluate(() => window.FAILED)
  if (failed) { console.error(failed); await browser.close(); server.close(); process.exit(1) }

  const [DUR, FPS, BEATS] = await page.evaluate(() => [window.DUR, window.FPS, window.BEATS])
  const frame = (t) => page.evaluate((v) => window.frame(v), t)
  const story = JSON.parse(fs.readFileSync(path.join(ROOT, 'story.json'), 'utf8'))
  // the place plan and the history: what the scene really built, against what the story says and the recent videos
  const [built, usedModels] = await page.evaluate(() => [window.FK_PLACES ?? [], [...(window.FK_MODELS ?? [])]])
  const pc = checkPlaces(story, built, usedModels, BEATS.length), rc = checkRepeat(story, built, usedModels, ROOT), placeErrors = [...pc.errors, ...rc.errors]
  for (const n of [...pc.notes, ...rc.notes]) console.log(`places: ${n}`)
  for (const e of placeErrors) console.log(`PLACES: ${e}`)
  if (cmd === 'video' && placeErrors.length) { console.log('REFUSED: fix the place plan above (or pick other places), then render again.'); await browser.close(); server.close(); process.exit(1) }

  if (cmd === 'check') {
    for (const b of BEATS) console.log(`${String(b.index + 1).padStart(2)}  ${b.start.toFixed(2)}s +${b.dur.toFixed(2)}s  ${b.style.padEnd(10)} ${b.scene.padEnd(10)} ${b.line ?? ''}`)
    console.log(`Total ${DUR.toFixed(2)}s at ${FPS} fps.`)
  } else if (cmd === 'stills') {
    await page.evaluate(() => { window.FK_STILLS = true }) // stills show collision problems as a red banner
    const dir = path.join(ROOT, 'stills')
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    const custom = process.argv[3]
    const shots = custom
      ? custom.split(',').map(Number).map((t) => ({ t, name: `t${t.toFixed(2).padStart(6, '0')}.jpg` }))
      : BEATS.map((b) => ({ t: b.start + b.dur * 0.6, name: `beat${String(b.index + 1).padStart(2, '0')}.jpg` }))
    for (const s of shots) {
      fs.writeFileSync(path.join(dir, s.name), Buffer.from(await frame(s.t), 'base64'))
      { const iss = await page.evaluate(() => window.FK_ISSUES ?? []); for (const x of iss) console.log(`ISSUE at ${s.name}: ${x}`) }   // the agent reads these before the video
      console.log(`stills/${s.name}`)
    }
    // always one sheet of every still (the app shows stills/sheet.jpg), for beat stills and custom times alike
    if (hasFfmpeg()) {
      const cols = Math.min(shots.length, 6), rows = Math.ceil(shots.length / cols)
      spawnSync(FF, ['-v', 'error', '-y', '-pattern_type', 'glob', '-framerate', '1', '-i', path.join(dir, custom ? 't*.jpg' : 'beat*.jpg'), '-vf', `scale=320:-1,tile=${cols}x${rows}:padding=6:color=black`, '-frames:v', '1', path.join(dir, 'sheet.jpg')])
      console.log('stills/sheet.jpg  (all stills on one picture)')
    }
  } else if (cmd === 'video') {
    if (!hasFfmpeg()) { console.error('ffmpeg is missing. In the workspace folder run: node setup.mjs'); process.exit(1) }
    fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true })
    const opt = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null }
    const silent = process.argv.includes('--silent')
    const until = opt('--until') ? Math.min(DUR, Number(opt('--until'))) : DUR
    const voice = !silent && fs.existsSync(path.join(ROOT, 'voice/voice.mp3')) ? path.join(ROOT, 'voice/voice.mp3') : null
    const music = !silent && story.music && fs.existsSync(path.resolve(ROOT, story.music)) ? path.resolve(ROOT, story.music) : null
    // 1. the sound under the picture: the soundtrack made in code (voice + score or the person's music), or the voice and music as they are
    let base = null
    if (!silent) {
      try { base = await (await import('./audio/soundtrack.mjs')).soundtrack(ROOT, story) } catch (e) { console.error('soundtrack failed, using the voice alone:', e.message) }
      if (!base && (voice || music)) {
        const mv = story.musicVolume ?? (voice ? 0.15 : 0.8), b = path.join(ROOT, 'out', 'base.wav'), a = []
        if (voice) a.push('-i', voice); if (music) a.push('-stream_loop', '-1', '-i', music)
        const f = voice && music ? `[1:a]volume=${mv}[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]` : voice ? '[0:a]anull[a]' : `[0:a]volume=${mv}[a]`
        if (spawnSync(FF, ['-v', 'error', '-y', ...a, '-filter_complex', f, '-map', '[a]', '-t', until.toFixed(3), b]).status === 0) base = b
      }
    }
    // 2. the picture, rendered silent; the directing helpers log what appears on screen as it goes (for the sound effects)
    const outFile = opt('--out') ? path.resolve(opt('--out')) : path.join(ROOT, 'out', 'video.mp4')
    const partFile = outFile.replace(/\.mp4$/, '') + '.part.mp4', pictureFile = outFile.replace(/\.mp4$/, '') + '.picture.mp4'
    const args = ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-', '-t', until.toFixed(3), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', pictureFile]
    const ff = spawn(FF, args, { stdio: ['pipe', 'inherit', 'inherit'] })
    const N = Math.round(until * FPS), clips = [], events = []
    for (let n = 0; n < N; n++) {
      const buf = Buffer.from(await frame(n / FPS), 'base64')
      const [issues, ev] = await page.evaluate(() => [window.FK_ISSUES ?? [], window.FK_EVENTS ?? []])
      if (issues.length) { const b = BEATS.filter((x) => x.start <= n / FPS + 1e-6).pop(); clips.push({ t: n / FPS, beat: (b?.index ?? 0) + 1, issues }) }
      events.push(...ev)
      if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain')
      if (n % FPS === 0) process.stdout.write(`\rrendering ${Math.round((n / N) * 100)}%  (${(n / FPS).toFixed(0)}s of ${DUR.toFixed(0)}s)`)
    }
    ff.stdin.end()
    const [code] = await once(ff, 'close')
    // collisions block the video: nothing may pass through anything. Group frames with the same problems.
    if (clips.length) {
      fs.rmSync(pictureFile, { force: true })
      console.log(`\nREFUSED: ${clips.length} frame(s) have parts passing through each other or the floor. Fix them, check with stills, render again.`)
      let last = ''
      for (const c of clips) { const k = c.beat + c.issues.join('|'); if (k !== last) console.log(`CLIP at ${c.t.toFixed(2)}s (beat ${c.beat}): ${c.issues.join('; ')}`); last = k }
      process.exitCode = 1
    } else if (code === 0) {
      // 3. the sound effects (one per thing that appears, out/sfx-plan.json), mixed onto the soundtrack, then picture + sound
      let audio = base
      if (base && story.sfx !== false) {
        try {
          const { planSfx, savePlan } = await import('./audio/sfx-plan.mjs'), { mixSfx } = await import('./audio/sfx-mix.mjs')
          const plan = planSfx(events.filter((e) => e.at <= until)); savePlan(ROOT, plan)
          audio = mixSfx(base, voice, plan, path.join(ROOT, 'out', 'final.wav')); console.log(`\nsfx: ${plan.length} sounds (out/sfx-plan.json)`)
        } catch (e) { console.error('\nsfx skipped:', e.message) }
      }
      const mux = audio ? ['-i', pictureFile, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest'] : ['-i', pictureFile, '-c', 'copy']
      const m = spawnSync(FF, ['-v', 'error', '-y', ...mux, '-movflags', '+faststart', partFile])
      fs.rmSync(pictureFile, { force: true })
      if (m.status === 0) { fs.renameSync(partFile, outFile); if (until >= DUR - 0.01) addHistory(story, built, usedModels, ROOT); console.log(`\rDone: ${path.relative(ROOT, outFile)} (${until.toFixed(1)}s)            `) } else console.log('\nmuxing failed: ' + (m.stderr?.toString().slice(-300) ?? ''))
    }
    else console.log(`\nffmpeg failed (${code})`)
  }
  await browser.close()
  server.close()
}

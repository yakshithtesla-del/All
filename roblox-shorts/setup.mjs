// One-time setup of the workspace. Needs only Node.js 20 or newer. Run it in the workspace folder:
//   node setup.mjs
// It installs the packages (three.js, a browser for rendering, ffmpeg, the free voice), then renders one test picture.
// Safe to run again: it only does what is missing.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const say = (ok, msg) => console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`)
const major = Number(process.versions.node.split('.')[0])
if (major < 20) { say(false, `Node.js ${process.versions.node} is too old. Install Node.js 20 or newer from https://nodejs.org (the LTS button), then run this again.`); process.exit(1) }
say(true, `Node.js ${process.versions.node}`)

const need = ['three', 'puppeteer', 'ffmpeg-static', 'msedge-tts']
const missing = () => need.filter((n) => !fs.existsSync(path.join(ROOT, 'node_modules', n)))
if (missing().length) {
  console.log(`Installing packages (${missing().join(', ')}). The first time downloads a browser, about 200 MB, and takes a few minutes...`)
  let r
  for (let k = 1; k <= 3; k++) {   // a dropped connection (ENOTFOUND, ECONNRESET) is common on the first install: try again
    r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-fund', '--no-audit'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
    if (r.status === 0 && !missing().length) break
    if (k < 3) { console.log(`npm install did not finish (try ${k}/3); trying again in ${k * 5} s...`); spawnSync(process.platform === 'win32' ? 'timeout' : 'sleep', process.platform === 'win32' ? ['/t', String(k * 5)] : [String(k * 5)], { shell: process.platform === 'win32' }) }
  }
  if (r.status !== 0 || missing().length) { say(false, 'npm install did not finish. Check the internet connection and run: node setup.mjs'); process.exit(1) }
}
say(true, 'packages installed')

const { ffmpegPath } = await import('./lib/ffmpeg.mjs')
try { say(true, `ffmpeg: ${await ffmpegPath() === 'ffmpeg' ? 'the one on this computer' : 'the bundled copy'}`) } catch (e) { say(false, e.message); process.exit(1) }

// the browser: launch it once; if its download was skipped, fetch it
const puppeteer = (await import('puppeteer')).default
async function launches() { try { const b = await puppeteer.launch({ headless: true }); await b.close(); return true } catch { return false } }
if (!(await launches())) {
  console.log('Downloading the rendering browser...')
  spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['puppeteer', 'browsers', 'install', 'chrome'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
  if (!(await launches())) { say(false, 'the rendering browser could not start. Run: npx puppeteer browsers install chrome   then: node setup.mjs'); process.exit(1) }
}
say(true, 'rendering browser starts')

// one test picture from the bundled example
const ex = ROOT   // the template's own example (story.json + scenes/balloons.js)
const r = spawnSync(process.execPath, [path.join(ROOT, 'render.mjs'), 'stills', '1'], { cwd: ex, encoding: 'utf8' })
if (r.status !== 0 || !fs.existsSync(path.join(ex, 'stills', 't001.00.jpg'))) { say(false, `the test picture failed:\n${(r.stderr || r.stdout || '').slice(0, 600)}`); process.exit(1) }
say(true, 'test picture rendered: stills/t001.00.jpg')
console.log('\nREADY.')

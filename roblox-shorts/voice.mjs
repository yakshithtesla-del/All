// The voice. Run it from inside a video folder (videos/<name>), where story.json is:
//   node ../../voice.mjs check                                   which voice options are ready (never prints keys)
//   node ../../voice.mjs voices [--provider fish|elevenlabs|free] voices you can use
//   node ../../voice.mjs sample --text "Hello there" [--provider p] [--voice id] [--speed 1.2]   one test clip
//   node ../../voice.mjs make [--provider p] [--voice id] [--pause 0.15] [--speed 1.0]           voice the whole story
//   node voice.mjs chunks                       the script in pieces of 500 characters or less, to paste on fish.audio by hand
//   node voice.mjs import [folder] [--speed 1.0] [--pause 0.15]   the files downloaded from fish.audio -> the voice
//
// make writes voice/voice.mp3, voice/timing.json (the start and end of every line and word; the engine syncs the
// shots and captions to it) and voice/mouth.json (lip-sync: how open the mouth is on every frame). Lines that did not change are reused from voice/cache/, so re-runs are cheap.
//
// Three ways to get a voice:
//   fish        Fish Audio key (FISH_AUDIO_API_KEY). Default voice: "Roblox Rant", the kid voice of these shorts.
//   elevenlabs  ElevenLabs key (ELEVENLABS_API_KEY). Default voice: Adam. Gives exact word times.
//   free        no account and no key: Microsoft Edge's read-aloud voices. Default: Ana (a kid). Exact word times.
// With no --provider: the provider in story.json ("voice": {"provider", "id"}), else Fish if its key is set, else
// ElevenLabs if its key is set, else free.
// Keys go in a file named .env (in the video folder, the workspace folder or your home folder), one per line:
//   FISH_AUDIO_API_KEY=...        ELEVENLABS_API_KEY=...
// A line in story.json may set "emotion": "scared, fast" (Fish reads it as a tag), "voice": "<id>" and "pause": seconds.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { ffmpeg, ffmpegPath } from './lib/ffmpeg.mjs'

const ENGINE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = process.cwd()
const DEFAULT_VOICE = { fish: 'e0fbbf9e5123434fb77c7a7eeaacb312', elevenlabs: 'pNInz6obpgDQGcFmaJgB', free: 'en-US-AnaNeural' }
const FREE_VOICES = [
  ['en-US-AnaNeural', 'Ana: a kid, US (the default)'], ['en-US-ChristopherNeural', 'Christopher: man, US, calm'], ['en-US-GuyNeural', 'Guy: man, US'],
  ['en-US-JennyNeural', 'Jenny: woman, US'], ['en-US-AriaNeural', 'Aria: woman, US, lively'], ['en-GB-RyanNeural', 'Ryan: man, UK'],
  ['en-GB-MaisieNeural', 'Maisie: a kid, UK'], ['en-AU-WilliamNeural', 'William: man, Australia'],
]

function die(msg) { console.error(msg); process.exit(1) }
function loadEnv() {
  for (const f of [path.join(PROJECT, '.env'), path.join(ENGINE, '.env'), path.join(os.homedir(), '.env'), path.join(os.homedir(), '.config', 'roblox-shorts', '.env')]) {
    if (!fs.existsSync(f)) continue
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
      { const v = m && m[2].trim().replace(/^["']|["']$/g, ''); if (m && v && !process.env[m[1]]) process.env[m[1]] = v }   // an empty KEY= line never hides a real key below or in another .env
    }
  }
}
const keyOf = (p) => (p === 'fish' ? process.env.FISH_AUDIO_API_KEY || process.env.FISH_API_KEY : p === 'elevenlabs' ? process.env.ELEVENLABS_API_KEY : 'free')
function needKey(p) {
  const k = keyOf(p)
  if (!k) die(`NO_KEY: no ${p === 'fish' ? 'FISH_AUDIO_API_KEY' : 'ELEVENLABS_API_KEY'} found in .env. Add it, or use the free voice: --provider free`)
  return k
}
async function http(method, url, headers, body, raw = false) {
  let r
  try { r = await fetch(url, { method, headers: { 'User-Agent': 'roblox-shorts/1.0', ...headers }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(180000) }) }
  catch (e) { die(`NETWORK: could not reach ${new URL(url).host}: ${e.message}`) }
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 400)
    if (r.status === 401 || r.status === 403) die(`AUTH_FAILED (${r.status}): the API key was rejected. Check it was copied fully. ${detail}`)
    if (r.status === 402 || /quota|credit|balance/i.test(detail)) die(`OUT_OF_CREDITS (${r.status}): the voice account has no credits left. Use the free voice: --provider free. ${detail}`)
    die(`HTTP ${r.status} from ${url.split('?')[0]}: ${detail}`)
  }
  return raw ? Buffer.from(await r.arrayBuffer()) : r.json()
}

// ---------- the three providers: each returns { audio: mp3 Buffer, words: [[word, start, end]] | null } ----------
async function fishTts(text, voice) {
  const audio = await http('POST', 'https://api.fish.audio/v1/tts', { Authorization: `Bearer ${needKey('fish')}`, 'Content-Type': 'application/json', model: process.env.FISH_MODEL || 's2.1-pro' }, { text, format: 'mp3', reference_id: voice }, true)
  return { audio, words: null } // Fish gives no word times: they are spread over the line by length
}
async function elevenTts(text, voice, speed) {
  const body = { text, model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2' }
  if (speed !== 1) body.voice_settings = { speed: Math.max(0.7, Math.min(1.2, speed)) }
  const d = await http('POST', `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, { 'xi-api-key': needKey('elevenlabs'), 'Content-Type': 'application/json' }, body)
  const al = d.alignment || d.normalized_alignment || {}
  const words = []; let cur = '', ws = null, we = null
  ;(al.characters || []).forEach((c, i) => {
    if (/\s/.test(c)) { if (cur) words.push([cur, ws, we]); cur = ''; ws = null; return }
    if (ws === null) ws = al.character_start_times_seconds[i]
    cur += c; we = al.character_end_times_seconds[i]
  })
  if (cur) words.push([cur, ws, we])
  return { audio: Buffer.from(d.audio_base64, 'base64'), words }
}
async function freeTts(text, voice, speed = 1) {
  let mod
  try { mod = await import('msedge-tts') } catch { die('NOT_SET_UP: the free voice package is missing. In the workspace folder run: node setup.mjs') }
  const tts = new mod.MsEdgeTTS()
  try {
    await tts.setMetadata(voice, mod.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true })
    // the free voice changes speed by itself (cleaner than stretching the audio afterwards)
    const rate = speed !== 1 ? { rate: `${speed > 1 ? '+' : '-'}${Math.round(Math.abs(speed - 1) * 100)}%` } : undefined
    const { audioStream, metadataStream } = await tts.toStream(text, rate)
    const chunks = [], meta = []
    metadataStream?.on('data', (d) => meta.push(d.toString()))
    await new Promise((res, rej) => { audioStream.on('data', (c) => chunks.push(c)); audioStream.on('end', res); audioStream.on('close', res); audioStream.on('error', rej) })
    const bounds = []
    for (const m of meta) { try { for (const x of JSON.parse(m).Metadata || []) if (x.Type === 'WordBoundary') bounds.push([x.Data.text.Text, x.Data.Offset / 1e7, (x.Data.Offset + x.Data.Duration) / 1e7]) } catch {} }
    if (!chunks.length) die('NETWORK: the free voice returned no audio. Check the internet connection and try again.')
    return { audio: Buffer.concat(chunks), words: alignTokens(text, bounds) }
  } catch (e) { die(`NETWORK: the free voice failed (${e.message}). Try again, or use Fish Audio or ElevenLabs with a key.`) } finally { try { tts.close() } catch {} }
}
/** The free voice times bare words ("town"); captions need the written tokens ("town,"). Null when they don't line up. */
function alignTokens(text, bounds) {
  const toks = text.split(/\s+/).filter(Boolean), bare = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const out = []; let j = 0
  for (const tok of toks) {
    const want = bare(tok)
    if (!want) { if (out.length) out[out.length - 1][0] += ' ' + tok; continue }
    let got = '', s = null, e = null
    while (j < bounds.length && got.length < want.length) { got += bare(bounds[j][0]); s ??= bounds[j][1]; e = bounds[j][2]; j++ }
    if (s === null) return null
    out.push([tok, s, e])
  }
  return out.length ? out : null
}
const TTS = { fish: fishTts, elevenlabs: elevenTts, free: freeTts }

// ---------- helpers ----------
const clean = (t) => t.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim()
function spreadWords(text, dur) { // word times estimated from word length (for providers that give none)
  const toks = text.split(/\s+/).filter(Boolean)
  if (!toks.length) return []
  const usable = Math.max(0.1, dur - 0.1), w = toks.map((t) => t.length + 2), total = w.reduce((a, b) => a + b, 0)
  let t = 0.05
  return toks.map((tok, i) => { const d = (usable * w[i]) / total, r = [tok, t, t + d]; t += d; return r })
}
function wavSeconds(file) { // 44.1 kHz mono 16-bit, written by ffmpeg below
  const buf = fs.readFileSync(file), at = buf.indexOf('data', 12, 'latin1')
  return (buf.length - (at + 8)) / (44100 * 2)
}
const TRIM = 'silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB,areverse'
/** mp3 -> wav with the dead air cut off both ends: to [from, to] seconds when the word times are known, else by silence. */
function toWav(src, dst, speed, cut) {
  const af = [cut ? null : TRIM, speed !== 1 ? `atempo=${speed}` : null].filter(Boolean).join(',')
  return ffmpeg('-i', src, ...(cut ? ['-ss', cut[0].toFixed(3), '-to', cut[1].toFixed(3)] : []), ...(af ? ['-af', af] : []), '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', dst)
}
async function silence(cache, sec) {
  const f = path.join(cache, `silence_${sec.toFixed(3)}.wav`)
  if (!fs.existsSync(f)) await ffmpeg('-f', 'lavfi', '-t', sec.toFixed(3), '-i', 'anullsrc=r=44100:cl=mono', '-c:a', 'pcm_s16le', f)
  return f
}
const args = process.argv.slice(3)
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt }
function readStory() {
  const f = path.join(PROJECT, 'story.json')
  if (!fs.existsSync(f)) die('NO_STORY: there is no story.json in this folder. cd into your video folder (videos/<name>) first.')
  return JSON.parse(fs.readFileSync(f, 'utf8'))
}
function pickProvider(story) {
  const p = opt('--provider') || story?.voice?.provider || (keyOf('fish') ? 'fish' : keyOf('elevenlabs') ? 'elevenlabs' : 'free')
  if (!TTS[p]) die(`Unknown provider "${p}". Use fish, elevenlabs or free.`)
  return p
}

// ---------- lip-sync data ----------
/** One second-order filter pass ('lp' or 'hp') over samples x at sample rate sr. */
function biquad(x, type, f, sr, q = 0.707) {
  const w = (2 * Math.PI * f) / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al
  const b = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2], a1 = -2 * c, a2 = 1 - al
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) { const v = x[i], o = (b[0] * v + b[1] * x1 + b[2] * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o }
  return y
}
/**
 * voice/mouth.json: for every video frame, [open, wide, round] (0..1). Open follows the loudness (fast to open, a
 * little slower to close); wide vs round comes from where the sound's energy sits (bright "ee, s" vs dark "oo, oh").
 */
async function mouthData(vdir, fps = 30) {
  const SR = 16000, r = spawnSync(await ffmpegPath(), ['-v', 'error', '-i', path.join(vdir, 'voice.mp3'), '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 })
  if (r.status !== 0) return console.error('lip-sync data skipped: could not read voice/voice.mp3')
  const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4))
  const low = biquad(biquad(x, 'hp', 200, SR), 'lp', 900, SR), high = biquad(biquad(x, 'hp', 2200, SR), 'lp', 5500, SR)
  const hop = SR / fps, n = Math.ceil(x.length / hop), rms = [], lo = [], hi = []
  for (let f = 0; f < n; f++) {
    let a = 0, b = 0, c = 0; const s = Math.floor(f * hop), e = Math.min(x.length, Math.floor(s + hop * 1.5))
    for (let i = s; i < e; i++) { a += x[i] * x[i]; b += low[i] * low[i]; c += high[i] * high[i] }
    const m = Math.max(1, e - s); rms.push(Math.sqrt(a / m)); lo.push(Math.sqrt(b / m)); hi.push(Math.sqrt(c / m))
  }
  const sorted = [...rms].sort((p, q) => p - q), top = sorted[Math.floor(sorted.length * 0.97)] || 1, floor = sorted[Math.floor(sorted.length * 0.3)] * 1.5
  const frames = [], r2 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100; let jaw = 0
  for (let f = 0; f < n; f++) {
    const v = Math.max(0, (rms[f] - floor) / Math.max(1e-6, top - floor)), target = Math.min(1, v ** 0.8)
    jaw += (target - jaw) * (target > jaw ? 0.7 : 0.45)
    const bright = hi[f] / Math.max(1e-6, lo[f] + hi[f]), round = jaw * Math.max(0, 0.5 - bright) * 1.4
    frames.push(jaw > 0.06 ? [r2(jaw * 0.88 + jaw * (1 - bright) * 0.45 + round * 0.3 + Math.min(1, v) * 0.55), r2(Math.min(1, bright * 1.6) * jaw), r2(round)] : [0, 0, 0])
  }
  fs.writeFileSync(path.join(vdir, 'mouth.json'), JSON.stringify({ fps, frames }))
}

// ---------- commands ----------
async function check() {
  console.log(`Fish Audio key (FISH_AUDIO_API_KEY): ${keyOf('fish') ? 'set' : 'missing'}`)
  console.log(`ElevenLabs key (ELEVENLABS_API_KEY): ${keyOf('elevenlabs') ? 'set' : 'missing'}`)
  console.log('Free voice: always available (needs internet)')
  console.log(`With no --provider, this folder would use: ${pickProvider(fs.existsSync(path.join(PROJECT, 'story.json')) ? readStory() : null)}`)
}
async function voices() {
  const p = opt('--provider') || (keyOf('fish') ? 'fish' : keyOf('elevenlabs') ? 'elevenlabs' : 'free')
  if (p === 'free') { for (const [id, what] of FREE_VOICES) console.log(`${id} | ${what}`); return console.log('Any Microsoft Edge voice name works, for example en-IN-NeerjaNeural.') }
  if (p === 'fish') {
    console.log(`${DEFAULT_VOICE.fish} | Roblox Rant (the default: the kid voice of these shorts)`)
    const d = await http('GET', 'https://api.fish.audio/model?self=true&page_size=50', { Authorization: `Bearer ${needKey('fish')}` })
    for (const m of d.items || []) console.log(`${m._id} | ${m.title} (yours)`)
    return console.log('Any public voice works too: open it on fish.audio and copy the id from its page address.')
  }
  const d = await http('GET', 'https://api.elevenlabs.io/v1/voices', { 'xi-api-key': needKey('elevenlabs') })
  for (const v of d.voices || []) console.log(`${v.voice_id} | ${v.name} | ${Object.values(v.labels || {}).join(', ')}`)
}
async function sample() {
  const text = opt('--text') || die('Give the words: --text "Hello there"')
  const p = pickProvider(null), voice = opt('--voice') || DEFAULT_VOICE[p], speed = Number(opt('--speed', 1))
  const out = path.resolve(opt('--out', 'voice-sample.mp3')), tmp = out + '.raw.mp3'
  const { audio } = await TTS[p](text, voice, speed)
  fs.writeFileSync(tmp, audio)
  await ffmpeg('-i', tmp, ...(p === 'fish' && speed !== 1 ? ['-af', `atempo=${speed}`] : []), '-c:a', 'libmp3lame', '-q:a', '2', out)
  fs.rmSync(tmp, { force: true })
  console.log(`Done: ${path.relative(PROJECT, out)} (${p}, voice ${voice})`)
}
async function make() {
  const story = readStory(), p = pickProvider(story)
  const main = opt('--voice') || story.voice?.id || DEFAULT_VOICE[p], pause = Number(opt('--pause', 0.15)), speed = Number(opt('--speed', 1))
  const vdir = path.join(PROJECT, 'voice'), cache = path.join(vdir, 'cache')
  fs.mkdirSync(cache, { recursive: true })
  const post = p === 'fish' ? speed : 1 // ElevenLabs and the free voice speed up by themselves; Fish clips are sped up afterwards (pitch kept)
  const lines = [], parts = []; let t = 0
  for (const [i, beat] of story.beats.entries()) {
    const text = clean(beat.line), voice = beat.voice || main
    const spoken = beat.emotion && p === 'fish' ? `[${beat.emotion.replace(/[\[\]]/g, '').trim()}] ${text}` : text
    const h = crypto.createHash('sha1').update([p, process.env.FISH_MODEL || '', voice, speed, spoken].join('|')).digest('hex').slice(0, 16)
    const wav = path.join(cache, `${h}.wav`), meta = path.join(cache, `${h}.json`)
    if (!(fs.existsSync(wav) && fs.existsSync(meta))) {
      console.log(`voicing ${i + 1}/${story.beats.length}: ${text.slice(0, 60)}`)
      const { audio, words } = await TTS[p](spoken, voice, speed)
      const mp3 = path.join(cache, `${h}.mp3`)
      fs.writeFileSync(mp3, audio)
      // keep 0.04 s before the first word and 0.1 s after the last; the rest of the clip is dead air
      const cut = words?.length ? [Math.max(0, words[0][1] - 0.04), words[words.length - 1][2] + 0.1] : null
      await toWav(mp3, wav, post, cut)
      fs.rmSync(mp3, { force: true })
      const dur = wavSeconds(wav)
      // Fish gives no word times: get them from ElevenLabs forced alignment when that key is set, else spread them
      const aligned = !cut && p === 'fish' ? await alignWords(wav, text) : null
      const timed = cut ? words.map(([w, s, e]) => [w, (s - cut[0]) / post, (e - cut[0]) / post]).filter(([w]) => clean(w)) : aligned?.length ? aligned : spreadWords(text, dur)
      fs.writeFileSync(meta, JSON.stringify({ words: timed }))
    } else console.log(`cached  ${i + 1}/${story.beats.length}: ${text.slice(0, 60)}`)
    const dur = wavSeconds(wav), words = JSON.parse(fs.readFileSync(meta, 'utf8')).words
    const r3 = (v) => Math.round(v * 1000) / 1000
    lines.push({ index: i, text, start: r3(t), end: r3(t + dur), words: words.map(([w, s, e]) => ({ word: w, start: r3(t + s), end: r3(t + e) })) })
    parts.push(wav); t += dur
    if (i < story.beats.length - 1) { const pz = Number(beat.pause ?? pause); if (pz > 0) { parts.push(await silence(cache, pz)); t += pz } }
  }
  parts.push(await silence(cache, 0.6)); t += 0.6
  const list = path.join(vdir, 'concat.txt')
  fs.writeFileSync(list, parts.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'\n`).join(''))
  await ffmpeg('-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-q:a', '2', path.join(vdir, 'voice.mp3'))
  fs.rmSync(list, { force: true })
  fs.writeFileSync(path.join(vdir, 'timing.json'), JSON.stringify({ provider: p, voice: main, duration: Math.round(t * 1000) / 1000, lines }, null, 1))
  await mouthData(vdir, story.fps ?? 30)
  const words = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0)
  console.log(`Done: voice/voice.mp3 (${t.toFixed(1)}s, ${Math.round((words / t) * 60)} words a minute) voice/timing.json (${lines.length} lines) and voice/mouth.json (lip-sync). Provider: ${p}, voice: ${main}.`)
}

// ---------- by hand: generate on fish.audio's website (free plan), then import the downloaded files ----------
const CHUNK_MAX = 480 // fish.audio's free plan takes up to 500 characters per generation
function chunkPlan(story) {
  const out = []; let cur = { beats: [], text: '' }
  for (const [i, beat] of story.beats.entries()) {
    const line = clean(beat.line)
    if (cur.beats.length && (cur.text + ' [long pause]\n' + line).length > CHUNK_MAX) { out.push(cur); cur = { beats: [], text: '' } }
    cur.beats.push(i); cur.text = cur.text ? cur.text + ' [long pause]\n' + line : line
  }
  if (cur.beats.length) out.push(cur)
  return out
}
async function chunks() {
  const story = readStory(), plan = chunkPlan(story), dir = path.join(PROJECT, 'voice', 'paste')
  fs.mkdirSync(dir, { recursive: true })
  for (const [k, c] of plan.entries()) fs.writeFileSync(path.join(dir, `${String(k + 1).padStart(2, '0')}.txt`), c.text + '\n')
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan.map((c) => c.beats)))
  console.log(`${plan.length} piece(s) to paste on fish.audio, in order. Each is in voice/paste/NN.txt:`)
  for (const [k, c] of plan.entries()) console.log(`\n--- piece ${k + 1} (${c.text.length} characters) ---\n${c.text}`)
  console.log(`\nFor each piece: fish.audio -> Text to Speech -> the voice "Roblox rant" -> paste it as it is ([long pause] included) -> Generate Speech -> Download (an upgrade pop-up may appear: close it, the file still downloads).
Leave them in Downloads. Run: node voice.mjs import --wait   (it carries on by itself once all ${plan.length} are downloaded)`)
}
/** Silent runs (start, end in seconds) in mono samples x at rate sr: below -38 dB of the peak for at least minGap. */
function silentRuns(x, sr, minGap = 0.12) {
  const hop = Math.round(sr * 0.01), n = Math.floor(x.length / hop), env = new Float32Array(n)
  let peak = 1e-6
  for (let f = 0; f < n; f++) { let a = 0; for (let i = f * hop; i < (f + 1) * hop; i++) a += x[i] * x[i]; env[f] = Math.sqrt(a / hop); peak = Math.max(peak, env[f]) }
  const thr = peak * 0.0126, runs = []; let s = -1
  for (let f = 0; f <= n; f++) {
    const quiet = f < n && env[f] < thr
    if (quiet && s < 0) s = f
    if (!quiet && s >= 0) { if ((f - s) * 0.01 >= minGap) runs.push([s * 0.01, f * 0.01]); s = -1 }
  }
  return runs
}

/** Exact word times for a recording + its text, from ElevenLabs forced alignment (needs ELEVENLABS_API_KEY with
 *  "Forced Alignment" access). Returns [[word, start, end], ...] or null. */
async function alignWords(file, text) {
  const key = keyOf('elevenlabs'); if (!key) return null
  const form = new FormData()
  form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file)); form.append('text', text)
  const r = await fetch('https://api.elevenlabs.io/v1/forced-alignment', { method: 'POST', headers: { 'xi-api-key': key }, body: form })
  if (!r.ok) { console.log(`(ElevenLabs alignment not used: HTTP ${r.status}${r.status === 401 ? ', the key needs "Forced Alignment" access' : ''}; cutting at the pauses instead)`); return null }
  const d = await r.json()
  return (d.words || []).filter((w) => w.text.trim()).map((w) => [w.text.trim(), w.start, w.end])
}
async function importVoice() {
  const story = readStory(), vdir = path.join(PROJECT, 'voice'), cache = path.join(vdir, 'cache'), from = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : path.join(vdir, 'fish'))
  const planFile = path.join(vdir, 'paste', 'plan.json')
  if (!fs.existsSync(planFile)) die('NO_PLAN: run "node voice.mjs chunks" first, paste those pieces on fish.audio, then import.')
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'))
  if (plan.flat().length !== story.beats.length) die('The story changed after "chunks". Run "node voice.mjs chunks" again and make the pieces again.')
  const audioIn = (dir, after = 0) => fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(mp3|wav|m4a|ogg|opus|flac)$/i.test(f)).map((f) => path.join(dir, f))
    .filter((f) => fs.statSync(f).mtimeMs > after).sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs) : []   // the order they were downloaded
  let files = audioIn(from)
  // --wait: the person is still downloading the pieces; watch Downloads until all of them are there (up to 30 min)
  if (args.includes('--wait') && files.length < plan.length) {
    const dl = path.join(os.homedir(), 'Downloads'), t0 = Date.now(); let seen = -1
    console.log(`Waiting for ${plan.length} file(s) from fish.audio in Downloads...`)
    while (Date.now() - t0 < 30 * 60 * 1000) {
      const now = audioIn(dl, fs.statSync(planFile).mtimeMs).filter((f) => !/\.(crdownload|download|part)$/i.test(f))
      if (now.length !== seen) { seen = now.length; if (seen) console.log(`  ${seen} of ${plan.length} downloaded`) }
      if (now.length >= plan.length) { await new Promise((r) => setTimeout(r, 1500)); break }
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  // nothing in voice/fish/: take the files downloaded to the Downloads folder since "chunks" ran (fish.audio saves there)
  if (!files.length && !(args[0] && !args[0].startsWith('--'))) { files = audioIn(path.join(os.homedir(), 'Downloads'), fs.statSync(planFile).mtimeMs); if (files.length) console.log(`Using ${files.length} file(s) from Downloads: ${files.map((f) => path.basename(f)).join(', ')}`) }
  if (!files.length) die(`NO_FILES: download the pieces from fish.audio first (they go to Downloads), or put them in ${path.relative(PROJECT, from)}/.`)
  if (files.length !== plan.length) die(`Found ${files.length} audio file(s) in ${path.relative(PROJECT, from)}/, but there are ${plan.length} piece(s). Download one file per piece.`)
  fs.mkdirSync(cache, { recursive: true })
  const speed = Number(opt('--speed', 1)), pause = Number(opt('--pause', 0.15)), SR = 16000
  const lines = [], parts = []; let t = 0
  for (const [k, beats] of plan.entries()) {
    const r = spawnSync(await ffmpegPath(), ['-v', 'error', '-i', files[k], '-af', TRIM, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 })
    if (r.status !== 0) die(`Could not read ${path.basename(files[k])}.`)
    const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4)), total = x.length / SR
    const texts = beats.map((i) => clean(story.beats[i].line))
    // 1) exact: ElevenLabs forced alignment of the whole piece (its own trim-free time base)
    const aligned = await alignWords(files[k], texts.join(' ')), toks = texts.map((t) => t.split(/\s+/).filter(Boolean).length)
    let segs = null
    if (aligned && aligned.length === toks.reduce((p, q) => p + q, 0)) {
      segs = []; let w0 = 0
      for (const n of toks) { const ws = aligned.slice(w0, w0 + n); w0 += n; const a = Math.max(0, ws[0][1] - 0.04), b = ws[n - 1][2] + 0.08; segs.push({ a, b, words: ws.map(([w, s1, e1]) => [w, s1 - a, e1 - a]), trim: false }) }
      console.log(`piece ${k + 1}: word times from ElevenLabs`)
    } else if (aligned) console.log(`piece ${k + 1}: the alignment did not match the text word for word; cutting at the pauses instead`)
    // 2) else: the [long pause] gaps between lines (the longest silences, in order, near where each line should end)
    if (!segs) {
      const lens = texts.map((s) => s.length + 4), sum = lens.reduce((a, b) => a + b, 0)
      const runs = silentRuns(x, SR, 0.3), cuts = []; let acc = 0, after = 0
      for (let j = 0; j < beats.length - 1; j++) {
        acc += lens[j]; const want = (total * acc) / sum
        let best = null, score = -1e9
        for (const [a, b] of runs) { const c = (a + b) / 2; if (c <= after + 0.2) continue; const sc = Math.min(1.2, b - a) * 6 - Math.abs(c - want); if (sc > score) { score = sc; best = [a, b] } }
        if (!best) die(`Could not find the pause after line ${beats[j] + 1} in ${path.basename(files[k])}. Paste the piece again with its [long pause] tags, generate, download and import again.`)
        cuts.push(best); after = (best[0] + best[1]) / 2
      }
      segs = [[0, cuts[0]?.[0] ?? total], ...cuts.map((c, j) => [c[1], cuts[j + 1]?.[0] ?? total])].map(([a, b]) => ({ a, b, words: null, trim: true }))
    }
    for (const [j, i] of beats.entries()) {
      const { a, b, words, trim } = segs[j], wav = path.join(cache, `import_${k}_${j}.wav`)
      // aligned times are on the raw file; pause cuts were measured on the trimmed audio
      await ffmpeg('-i', files[k], '-af', `${trim ? TRIM + ',' : ''}atrim=${Math.max(0, a - (trim ? 0.03 : 0)).toFixed(3)}:${(b + (trim ? 0.05 : 0)).toFixed(3)},asetpts=PTS-STARTPTS${speed !== 1 ? `,atempo=${speed}` : ''}`, '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', wav)
      const dur = wavSeconds(wav), r3 = (v) => Math.round(v * 1000) / 1000
      const timed = words ? words.map(([w, s1, e1]) => [w, s1 / speed, e1 / speed]) : spreadWords(texts[j], dur)
      lines.push({ index: i, text: texts[j], start: r3(t), end: r3(t + dur), words: timed.map(([w, s1, e1]) => ({ word: w, start: r3(t + s1), end: r3(t + e1) })) })
      parts.push(wav); t += dur
      if (i < story.beats.length - 1) { const pz = Number(story.beats[i].pause ?? pause); if (pz > 0) { parts.push(await silence(cache, pz)); t += pz } }
    }
  }
  parts.push(await silence(cache, 0.6)); t += 0.6
  const list = path.join(vdir, 'concat.txt')
  fs.writeFileSync(list, parts.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'\n`).join(''))
  await ffmpeg('-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-q:a', '2', path.join(vdir, 'voice.mp3'))
  fs.rmSync(list, { force: true })
  fs.writeFileSync(path.join(vdir, 'timing.json'), JSON.stringify({ provider: 'fish-by-hand', voice: 'Roblox Rant', duration: Math.round(t * 1000) / 1000, lines }, null, 1))
  await mouthData(vdir, story.fps ?? 30)
  const words = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0)
  console.log(`Done: voice/voice.mp3 (${t.toFixed(1)}s, ${Math.round((words / t) * 60)} words a minute) from ${files.length} file(s), voice/timing.json (${lines.length} lines) and voice/mouth.json. Listen once: if a line starts or ends in the wrong place, say which.`)
}

loadEnv()
const cmd = process.argv[2]
const run = { check, voices, sample, make, chunks, import: importVoice }[cmd]
if (!run) die('Usage (in the workspace): node voice.mjs check | voices | sample --text "..." | make [--provider fish|elevenlabs|free] [--voice id] [--pause 0.15] [--speed 1.0] | chunks | import [folder]')
await run()

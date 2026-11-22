// Real low-poly 3D models from Polyfork (https://polyfork.dev/assets): ~3,200 free models for three.js.
//
// node assets.mjs search dragon castle     find model slugs (one search per word)
// node assets.mjs get <slug> [<slug>...]   download into assets/<slug>.glb and list its parts + animations
// node assets.mjs info <slug>              parts + animations of a downloaded model
//
// License (polyfork.dev): free, commercial use OK, no attribution needed for using the model in your
// video. The .glb files themselves are CC BY 4.0: don't share or re-upload the files without credit.
// That's why models are downloaded per project into assets/ and never bundled with the skill.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(ROOT, 'assets')
const UA = { 'User-Agent': 'roblox-shorts-skill/3.0' }
const [cmd, ...args] = process.argv.slice(2)

function glbInfo(file) {
  const b = fs.readFileSync(file)
  const len = b.readUInt32LE(12)
  const j = JSON.parse(b.subarray(20, 20 + len).toString('utf8'))
  return {
    parts: (j.nodes ?? []).map((n) => n.name).filter(Boolean),
    animations: (j.animations ?? []).map((a) => a.name),
    rigged: (j.skins ?? []).length > 0,
  }
}

function printInfo(slug) {
  const f = path.join(DIR, `${slug}.glb`)
  const i = glbInfo(f)
  console.log(`${slug}  (${(fs.statSync(f).size / 1e6).toFixed(1)} MB)`)
  console.log(`  animations: ${i.animations.length ? i.animations.join(', ') : 'none (pose parts by name instead)'}`)
  console.log(`  parts: ${i.parts.slice(0, 40).join(', ')}${i.parts.length > 40 ? ', ...' : ''}`)
}

if (cmd === 'search') {
  if (!args.length) { console.log('Usage: node assets.mjs search <word> [<word>...]'); process.exit(1) }
  for (const q of args) {
    const res = await fetch(`https://polyfork.dev/assets?q=${encodeURIComponent(q)}`, { headers: UA })
    const html = await res.text()
    const slugs = [...new Set([...html.matchAll(/href="\/asset\/([a-z0-9-]+)"/g)].map((m) => m[1]))]
    console.log(`\n"${q}": ${slugs.length} models${slugs.length > 25 ? ' (first 25)' : ''}  · browse: https://polyfork.dev/assets?q=${encodeURIComponent(q)}`)
    for (const s of slugs.slice(0, 25)) console.log(`  ${s}`)
  }
} else if (cmd === 'get') {
  fs.mkdirSync(DIR, { recursive: true })
  for (const slug of args) {
    const f = path.join(DIR, `${slug}.glb`)
    if (!fs.existsSync(f)) {
      const res = await fetch(`https://polyfork.dev/cdn/${slug}.glb`, { headers: UA })
      if (!res.ok) { console.error(`${slug}: not found (${res.status}). Check the slug with: node assets.mjs search <word>`); continue }
      fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()))
    }
    printInfo(slug)
  }
} else if (cmd === 'info') {
  for (const slug of args) printInfo(slug)
} else {
  console.log('Usage: node assets.mjs search <words> | get <slugs> | info <slugs>')
}

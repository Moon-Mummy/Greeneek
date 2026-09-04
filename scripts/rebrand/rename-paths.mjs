#!/usr/bin/env node
// Path pass of the rebrand: renames tracked files/directories whose PATH
// components contain brand tokens, using the exact same RULES as the text
// pass so code references and filenames can never drift apart.
//
//   node scripts/rebrand/rename-paths.mjs --dry
//
// Deepest-first: a path is only renamed after all of its descendants moved,
// and while its ancestors are still in place — so `to` is always
// dirname(from) + map(basename(from)), no location bookkeeping needed.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { mapText, isDeniedPath, RESIDUE_ALLOWLIST } from './mapping.mjs'

const DRY = process.argv.includes('--dry')

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const allowlisted = (p) => RESIDUE_ALLOWLIST.some((a) => a.file.test(`./${p}`) || a.file.test(p))

// All path prefixes of brand-bearing tracked files (so shared directories are
// renamed exactly once), narrowed to prefixes whose OWN last component maps.
const prefixes = new Set()
for (const file of tracked) {
  if (isDeniedPath(file) || allowlisted(file)) continue
  if (!/(deep[\s_-]?seek|(?<![A-Za-z0-9])dsh(?![A-Za-z0-9]))/i.test(file)) continue
  const parts = file.split('/')
  for (let i = 1; i <= parts.length; i++) prefixes.add(parts.slice(0, i).join('/'))
}

const candidates = [...prefixes]
  .filter((p) => {
    const base = p.slice(p.lastIndexOf('/') + 1)
    return mapText(base) !== base
  })
  .sort((a, b) => b.split('/').length - a.split('/').length || b.length - a.length)

let count = 0
let skipped = 0
for (const from of candidates) {
  const base = from.slice(from.lastIndexOf('/') + 1)
  const to = (dirname(from) === '.' ? '' : dirname(from) + '/') + mapText(base)
  if (to === from) continue
  if (!DRY && !existsSync(from)) { skipped++; continue }
  if (isDeniedPath(from)) continue
  count++
  console.log(`${DRY ? '[dry] ' : ''}git mv ${from} -> ${to}`)
  if (!DRY) execFileSync('git', ['mv', from, to])
}
console.log(`${DRY ? '[dry] ' : ''}renamed=${count} skipped=${skipped}`)

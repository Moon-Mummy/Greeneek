#!/usr/bin/env node
// Text pass of the DeepSeek -> Greeneek rebrand.
//
//   node scripts/rebrand/rebrand.mjs --dry [--only <glob>[,<glob>...]] [--commit-ok]
//
// Walks `git ls-files` (so it only ever touches tracked, non-ignored files),
// skips binaries (NUL sniff), denied paths/names, and non-text extensions,
// then applies scripts/rebrand/mapping.mjs RULES line by line with the
// PROTECTED/BLOCK escape hatches honored.
//
// ALWAYS run `--dry` first and read `.rebrand/text-changes.diff`. That review
// is the "zero detail loss" guarantee; the residue verifier is its backstop.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs'
import { RULES, PROTECTED_LINE, BLOCK_START, BLOCK_END, FORCE_TEXT_FILES, RESIDUE_ALLOWLIST, isDeniedPath, isTextCandidate } from './mapping.mjs'

const DRY = process.argv.includes('--dry')
const onlyIdx = process.argv.indexOf('--only')
const ONLY = onlyIdx >= 0 ? process.argv[onlyIdx + 1].split(',').filter(Boolean) : ['**/*']

/** Tiny glob subset matcher: supports **, *, ? patterns from --only. */
function globToRe(pattern) {
  let out = '^'
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') { out += '.*'; i++ ; if (pattern[i + 1] === '/') i++ }
      else out += '[^/]*'
    } else if (c === '?') out += '[^/]'
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(out + '$')
}
const matchers = ONLY.map((p) => globToRe(p))
const MAX_BYTES = 8 * 1024 * 1024

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const report = []
let changedFiles = 0
let changedLines = 0

for (const file of tracked) {
  // A file whose residual brand tokens are LEDGERED (blocklist data, migration guide,
  // the gate itself) is never rewritten: its old-brand spellings are the payload.
  if (RESIDUE_ALLOWLIST.some((allow) => allow.file.test(file))) continue

  const forced = FORCE_TEXT_FILES.has(file)
  if (!forced && isDeniedPath(file)) continue
  if (!forced && !isTextCandidate(file)) continue
  if (!matchers.some((m) => m.test(file))) continue
  let buf
  try {
    if (lstatSync(file).isSymbolicLink()) continue // rewriting through a link would double-edit the target
    buf = readFileSync(file)
  } catch { continue }
  if (buf.length === 0 || buf.length > MAX_BYTES) continue
  if (!forced && buf.includes(0)) continue // binary guard (FORCE_TEXT opts out; utf8 round-trip is byte-exact when the file decodes cleanly)

  const src = buf.toString('utf8')
  if (!/deepseek|dsh/i.test(src)) continue
  const lines = src.split('\n')
  let inBlock = false
  let dirty = false
  const out = lines.map((line, i) => {
    if (BLOCK_START.test(line)) { inBlock = true; return line }
    if (BLOCK_END.test(line)) { inBlock = false; return line }
    if (inBlock) return line
    if (PROTECTED_LINE.some((re) => re.test(line))) return line
    let next = line
    for (const { re, to } of RULES) next = next.replace(re, to)
    if (next !== line) {
      dirty = true
      changedLines++
      report.push(`${file}:${i + 1}\n  - ${line.trim()}\n  + ${next.trim()}`)
    }
    return next
  }).join('\n')

  if (dirty) {
    changedFiles++
    if (!DRY) writeFileSync(file, out)
  }
}

mkdirSync('.rebrand', { recursive: true })
writeFileSync(DRY ? '.rebrand/text-changes.diff' : '.rebrand/text-applied.diff', report.join('\n') + '\n')
console.log(`${DRY ? '[dry] ' : '[applied] '}files=${changedFiles} lines=${changedLines} -> .rebrand/${DRY ? 'text-changes.diff' : 'text-applied.diff'}`)

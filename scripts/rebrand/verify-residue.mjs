#!/usr/bin/env node
// Post-rebrand residue gate (CI). Fails when any tracked file outside the
// allowlist still contains a brand token. `dsh` is checked at word
// boundaries only, exactly like the rename rules (protects `handshake`).
//
//   node scripts/rebrand/verify-residue.mjs
import { execFileSync } from 'node:child_process'
import { RESIDUE_ALLOWLIST } from './mapping.mjs'

const FORBIDDEN = 'deep[\\s_-]?seek|(?<![A-Za-z0-9])dsh(?![A-Za-z0-9])|(?<![A-Za-z0-9])Dsh(?![A-Za-z0-9])|(?<![A-Za-z0-9])DSH(?![A-Za-z0-9])'

let out = ''
try {
  out = execFileSync(
    'git',
    ['grep', '-n', '-I', '-i', '-P', '-e', FORBIDDEN, '--', '.'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
} catch (err) {
  // git grep exits 1 on "no matches" (clean). Anything else is an error.
  if (err.status !== 1) { console.error(String(err.stderr ?? err)); process.exit(2) }
  out = err.stdout ?? ''
}

// A line carrying the codemod's `rebrand:keep` marker is a deliberate,
// reviewed contract (compat shim, legacy env fallback, deprecation bin):
// the residue gate honors the same escape hatch the rewrite pass does, so a
// hand-marked line is invisible to both and the mark can never go stale
// silently (verify-egress still refuses DeepSeek *hosts* on any line).
const KEEP = /rebrand:keep/
const bad = out.split('\n').filter(Boolean).filter((line) => {
  if (KEEP.test(line)) return false
  const file = line.slice(0, line.indexOf(':')).replace(/^\.\//, '')
  return !RESIDUE_ALLOWLIST.some((a) => a.file.test(file) || a.file.test(`./${file}`))
})

if (bad.length) {
  console.error(`❌ DeepSeek/dsh residue outside allowlist (${bad.length} lines):`)
  console.error(bad.slice(0, 80).join('\n'))
  process.exit(1)
}
console.log('✅ no residue outside allowlist')

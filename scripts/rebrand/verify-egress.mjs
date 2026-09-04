#!/usr/bin/env node
// P8 static egress gate: proves the rebranded tree ships no DeepSeek
// endpoint. Checks tracked sources AND (when present) built artifacts.
// The one sanctioned mention family is the blocklist itself (the runtime
// guard that refuses to dial DeepSeek hosts) and allowlisted legal/provenance
// files — everything else fails the build.
//
//   node scripts/rebrand/verify-egress.mjs [--built]
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const HOSTS = 'deepseek\\.(com|ai|cn)|api\\.deepseek|platform\\.deepseek|chat\\.deepseek|www\\.deepseek'
// Files whose only allowed DeepSeek reference is the blocklist definition.
const GUARD_FILES = new Set([
  'packages/util/egress/src/index.ts',
  'packages/util/egress/tests/egress.spec.ts',
  'scripts/rebrand/verify-egress.mjs',
])
const ALLOWED_PREFIXES = ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'docs/migration-from-deepseek.md', 'scripts/rebrand/', '.rebrand/']

function scan(root, extraIgnores = []) {
  let out = ''
  try {
    const args = ['grep', '-n', '-I', '-i', '-e', HOSTS, '--', root]
    if (extraIgnores.length) args.splice(4, 0, ...extraIgnores.map((p) => `:(exclude)${p}`))
    out = execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  } catch (err) {
    if (err.status !== 1) { console.error(String(err.stderr ?? err)); process.exit(2) }
    out = err.stdout ?? ''
  }
  return out.split('\n').filter(Boolean).filter((line) => {
    const file = line.slice(0, line.indexOf(':')).replace(/^\.\//, '')
    if (GUARD_FILES.has(file)) return false
    if (ALLOWED_PREFIXES.some((p) => file === p || file.startsWith(p))) return false
    return true
  })
}

const bad = scan('.')
if (existsSync('apps/web/dist') || process.argv.includes('--built')) bad.push(...scan('apps/web/dist'), ...scan('apps/cli/lib'), ...scan('packages'))

if (bad.length) {
  console.error(`❌ DeepSeek endpoint reference outside the egress guard (${bad.length}):`)
  console.error(bad.slice(0, 40).join('\n'))
  process.exit(1)
}
console.log('✅ no DeepSeek endpoint reachable from shipped code')

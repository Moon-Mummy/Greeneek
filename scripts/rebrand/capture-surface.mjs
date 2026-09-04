#!/usr/bin/env node
// Captures a machine-readable surface snapshot of the workspace into a
// directory, so parity before/after the rebrand can be byte-compared.
//
//   node scripts/rebrand/capture-surface.mjs <outdir>
//
// Artifacts (all deterministic, sorted):
//   files.txt       tracked file list
//   packages.json   name/version/bin/main/exports/scripts of every package.json
//   urls.txt        every http(s) URL referenced in tracked text
//   commands.txt    CLI command/subcommand table extracted from the parser
//   tokens.txt      brand-token frequency table (sanity for the rename map)
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? '.rebrand/baseline'
mkdirSync(out, { recursive: true })

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  .filter((f) => !f.startsWith('.rebrand/')) // the parity rig must never observe its own snapshots
writeFileSync(join(out, 'files.txt'), [...tracked].sort().join('\n') + '\n')

// --- package identity surface ---
const identity = []
for (const file of tracked.filter((f) => f.endsWith('package.json') && !f.includes('node_modules/'))) {
  try {
    const pkg = JSON.parse(readFileSync(file, 'utf8'))
    identity.push({
      file,
      name: pkg.name, version: pkg.version, bin: pkg.bin, main: pkg.main,
      exports: pkg.exports, types: pkg.types, scripts: pkg.scripts,
      dependencies: pkg.dependencies, peerDependencies: pkg.peerDependencies,
    })
  } catch { identity.push({ file, parseError: true }) }
}
identity.sort((a, b) => a.file.localeCompare(b.file))
writeFileSync(join(out, 'packages.json'), JSON.stringify(identity, null, 2) + '\n')

// --- referenced URLs ---
const urlRe = /https?:\/\/[A-Za-z0-9._~:/?#@!$&*+,;=%-]+/g
const urls = new Set()
for (const file of tracked) {
  if (/node_modules|pnpm-lock\.yaml|\.(png|jpg|gif|ico|icns|woff2?|ttf|zip|gz)$/i.test(file)) continue
  let buf
  try { buf = readFileSync(file) } catch { continue }
  if (buf.length > 4 * 1024 * 1024 || buf.includes(0)) continue
  for (const m of buf.toString('utf8').matchAll(urlRe)) urls.add(m[0].replace(/[.,;:)\]}'"`]+$/, ''))
}
writeFileSync(join(out, 'urls.txt'), [...urls].sort().join('\n') + '\n')

// --- CLI surface: commander structure in the parser + the profile roster ---
const parser = 'apps/cli/src/args.ts'
try {
  const src = readFileSync(parser, 'utf8')
  const commands = [...src.matchAll(/\.command\('([a-z][\w-]*)'/g)].map((m) => `command ${m[1]}`)
  const options = [...src.matchAll(/\.option\('([^']*)'/g)].map((m) => `option ${m[1]}`)
  const args = [...src.matchAll(/\.arguments?\('([^']*)'/g)].map((m) => `args ${m[1]}`)
  const descriptions = [...src.matchAll(/\.description\('((?:[^'\\]|\\.)*)'/g)].map((m) => `describe ${m[1]}`)
  const helpExamples = src.includes('HELP_EXAMPLES')
    ? (src.slice(src.indexOf('HELP_EXAMPLES')).match(/ {2}\w[^\n]*/g) ?? []).map((s) => `example ${s.trim()}`)
    : []
  const profiles = readdirSync('apps/cli/config').filter((f) => f.endsWith('.yml')).map((f) => `profile ${f.slice(0, -4)}`)
  const surface = [...new Set([...commands, ...options, ...args, ...descriptions, ...helpExamples, ...profiles])].sort()
  writeFileSync(join(out, 'commands.txt'), `# derived from ${parser} + apps/cli/config\n` + surface.join('\n') + '\n')
} catch {
  writeFileSync(join(out, 'commands.txt'), '')
}

// --- brand-token frequency histogram (after the rebrand: only B5 leftovers) ---
const hist = new Map()
const BRAND_TOKEN = new RegExp('deep[\\s_-]?seek|(?<![A-Za-z0-9])dsh(?![A-Za-z0-9])', 'gi')
for (const file of tracked) {
  if (/node_modules|pnpm-lock\.yaml|\.(png|jpg|gif|ico|icns|woff2?|ttf|zip|gz)$/i.test(file)) continue
  let buf
  try { buf = readFileSync(file) } catch { continue }
  if (buf.length > 4 * 1024 * 1024 || buf.includes(0)) continue
  for (const m of buf.toString('utf8').matchAll(BRAND_TOKEN)) {
    hist.set(m[0], (hist.get(m[0]) ?? 0) + 1)
  }
}
const tokens = [...hist.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t, n]) => `${String(n).padStart(6)} ${t}`).join('\n') + '\n'
writeFileSync(join(out, 'tokens.txt'), tokens)
console.log(`captured -> ${out}`)

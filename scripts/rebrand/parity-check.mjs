#!/usr/bin/env node
// Parity gate: the post-rebrand surface must equal the baseline surface with
// the rename map applied to it. A clean pass proves no command, option,
// exported package identity, URL family, or file disappeared — every change
// is branding-only. Anything else is a regression that must be triaged into
// decisions.md's EXPECTED_DIFFS list (with a reason) or fixed.
//
//   node scripts/rebrand/parity-check.mjs
//
// Comparison is SET-based (canonical sort): renaming changes alphabetical
// position (dsh-* sorts before g*), so a sequence-aligned diff would explode
// one local change into hundreds of phantom shifts. Content equality is what
// parity means; order in the capture files carries no contract (each artifact
// is written sorted, and packages.json is an order-free array keyed by file).
import { readFileSync } from 'node:fs'
import { mapText, EXPECTED_DIFFS } from './mapping.mjs'

const ARTIFACTS = ['files.txt', 'packages.json', 'urls.txt', 'commands.txt']
// tokens.txt is a rename-map sanity report (frequency histograms do not survive
// token substitution semantically), printed by capture, never parity-enforced.
const BEFORE = '.rebrand/baseline'
const AFTER = '.rebrand/after'

function canonical(artifact, text) {
  if (artifact === 'packages.json') {
    const entries = JSON.parse(text)
    entries.sort((a, b) => String(a.file).localeCompare(String(b.file)))
    return entries.map((e) => JSON.stringify(e)).join('\n')
  }
  return text.split('\n').sort().join('\n')
}

let fail = 0
for (const artifact of ARTIFACTS) {
  let baseline, actual
  try {
    baseline = readFileSync(`${BEFORE}/${artifact}`, 'utf8')
    actual = readFileSync(`${AFTER}/${artifact}`, 'utf8')
  } catch (err) {
    console.error(`missing artifact ${artifact}: ${err.message}`)
    fail++
    continue
  }
  let expected
  try { expected = canonical(artifact, mapText(baseline)) } catch { expected = mapText(baseline) }
  let act
  try { act = canonical(artifact, actual) } catch { act = actual }
  if (expected === act) { console.log(`✅ ${artifact}: set-equal under the rename map`); continue }
  const exp = expected.split('\n')
  const actLines = act.split('\n')
  const expSet = new Set(exp)
  const actSet = new Set(actLines)
  const missing = exp.filter((l) => l.length > 0 && !actSet.has(l))
  const added = actLines.filter((l) => l.length > 0 && !expSet.has(l))
  const accepts = (direction, lines) => lines.filter((l) => !EXPECTED_DIFFS.some((e) =>
    e.artifact === artifact && e.direction === direction && e.pattern.test(l)))
  const stillMissing = accepts('missing', missing)
  const stillAdded = accepts('added', added)
  const clip = (l) => (l.length > 160 ? `${l.slice(0, 157)}…` : l)
  const shown = (lines) => lines.slice(0, 20).map((l) => `  ${clip(l)}`).join('\n')
  if (missing.length - stillMissing.length) console.log(`   ledger accepted: ${missing.length - stillMissing.length} superseded line(s)`)
  if (added.length - stillAdded.length) console.log(`   ledger accepted: ${added.length - stillAdded.length} intentional addition(s)`)
  if (stillMissing.length) { console.error('  MISSING — feature loss, triage or fix:'); console.error(shown(stillMissing)) }
  if (stillAdded.length) { console.error('  ADDED — unledgered addition:'); console.error(shown(stillAdded)) }
  if (!stillMissing.length && !stillAdded.length) { console.log(`✅ ${artifact}: parity within ledger`); continue }
  fail++
}
if (fail) {
  console.error('\nParity FAILED: triage each diff as (a) regression -> fix, or (b) intentional -> record in scripts/rebrand/decisions.md.')
  process.exit(1)
}
console.log('✅ parity: post-rebrand surface == baseline + rename map (as sets)')

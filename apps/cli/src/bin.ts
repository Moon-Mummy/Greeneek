#!/usr/bin/env node
/**
 * Command-line entry for gnk.
 * @module @greeneek/gnk/bin
 */

/* v8 ignore file -- built-bin acceptance exercises this self-executing dispatch. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadLayeredEnv } from '@greeneek/gnk-app-boot'
import { migrateGnkHome } from '@greeneek/gnk-home-paths'
import { parseGnkArgs } from './args.ts'

// Both the source tree (apps/cli/src) and the bundled bin (apps/cli/lib) sit
// one directory under apps/cli, so the checked-in manifest resolves with the
// same relative hop from either artifact.
function readVersion(): string {
  const manifest = JSON.parse(
    readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  ) as { version?: unknown }
  return typeof manifest.version === 'string' ? manifest.version : '0.0.0'
}

const invocation = parseGnkArgs(process.argv.slice(2), readVersion())

  // One-time home seeding from the pre-rebrand `~/.dsh` (copy, never move; // rebrand:keep
// idempotent, silent when the Greeneek home already exists or the user pinned
// $GNK_HOME). Runs before anything reads the home so a first boot finds the
// migrated settings, credentials, and profiles instead of an empty directory.
await migrateGnkHome()

switch (invocation.mode) {
  case 'profile': {
    const { runProfile } = await import('./profile-boot.ts')
    await runProfile({
      environment: loadLayeredEnv('gnk'),
      profile: invocation.profile,
      patchFiles: invocation.patches,
      args: invocation.args,
    })
    break
  }
  case 'plugin': {
    const { runPlugin } = await import('./plugin.ts')
    process.exit(runPlugin(invocation.profile, invocation.args))
    break
  }
  case 'dump-config': {
    const { runDumpConfig } = await import('./dump-config.ts')
    runDumpConfig(invocation.profile, invocation.defaultOnly, invocation.patches)
    break
  }
  default:
    invocation satisfies never
    throw new Error(`gnk: unhandled invocation mode ${JSON.stringify(invocation)}`)
}

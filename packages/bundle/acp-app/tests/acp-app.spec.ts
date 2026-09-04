/** The ACP app bundle's declared profile patch. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { entryListSchema } from '@greeneek/cordis-plugin-include'

describe('gnk-acp-app bundle', () => {
  it('declares startup-gated ACP serving without overriding base HMR policy', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      gnk?: { bundle?: { patch?: string } }
    }
    expect(manifest.gnk?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dependencies).toHaveProperty('@greeneek/gnk-acp')
    const patches = yaml.load(
      readFileSync(resolve(root, manifest.gnk!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as Array<{
      id?: string
      disabled?: boolean
      insert?: Array<{ config?: { model?: string; provider?: string }; id?: string; inject?: string[]; name?: string }>
    }>
    expect(patches.find(patch => patch.id === 'hmr')).toBeUndefined()
    expect(patches.find(patch => patch.id === 'session-title-llm')).toMatchObject({ disabled: true })
    const rows = patches.flatMap(patch => patch.insert ?? [])
    expect(rows.find(row => row.id === 'acp-app-startup')?.name).toBe('@greeneek/gnk-acp-app')
    // The row pins no route: this build ships no provider of its own, so the
    // ACP client's initial selection or the resolved default decides.
    expect(rows.find(row => row.id === 'acp')).toMatchObject({ inject: ['acpAppStartup'] })
    expect(rows.find(row => row.id === 'acp')?.config).toBeUndefined()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { GNK_ENV_PREFIX, LEGACY_ENV_PREFIX, scrubbedParentEnv } from '../src/index.ts'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('child-environment scrub (rebrand legacy prefixes included)', () => {
  it('strips harness variables under both the current and the legacy prefix', () => {
    expect(GNK_ENV_PREFIX).toBe('GNK_')
    expect(LEGACY_ENV_PREFIX).toBe('DSH_') // rebrand:keep
    vi.stubEnv('GNK_SETTINGS_SOMETHING', 'current')
    vi.stubEnv('DSH_SETTINGS_SOMETHING', 'legacy') // rebrand:keep
    vi.stubEnv('GNK_CORDIS_INTERNAL', 'current-2')
    const env = scrubbedParentEnv()
    expect(env.GNK_SETTINGS_SOMETHING).toBeUndefined()
    expect(env.DSH_SETTINGS_SOMETHING).toBeUndefined() // rebrand:keep
    expect(env.GNK_CORDIS_INTERNAL).toBeUndefined()
  })

  it('matches the legacy prefix case-insensitively, like the current one', () => {
    vi.stubEnv('dsh_lower_case', 'legacy') // rebrand:keep
    vi.stubEnv('Dsh_Mixed_Case', 'legacy-2') // rebrand:keep
    const env = scrubbedParentEnv()
    expect(env.dsh_lower_case).toBeUndefined() // rebrand:keep
    expect(env.Dsh_Mixed_Case).toBeUndefined() // rebrand:keep
  })

  it('keeps unrelated variables intact', () => {
    vi.stubEnv('KEEP_ME_CHILD_VAR', '/home/user')
    expect(scrubbedParentEnv().KEEP_ME_CHILD_VAR).toBe('/home/user')
  })
})

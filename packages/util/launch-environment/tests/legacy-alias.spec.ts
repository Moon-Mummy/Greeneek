import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLaunchEnvironmentSnapshot } from '@greeneek/gnk-launch-environment'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('legacy environment aliases (rebrand fallback, ends v1.0)', () => {
  it('rescues a GNK_ name from its DSH_ spelling only after a canonical miss', () => { // rebrand:keep
    const snapshot = createLaunchEnvironmentSnapshot([
      { source: 'process', values: { DSH_TOKEN: 'legacy-value' } }, // rebrand:keep
    ])
    expect(snapshot.get('GNK_TOKEN')).toMatchObject({ value: 'legacy-value', source: 'process' })
  })

  it('never lets the legacy spelling shadow the canonical variable', () => {
    const snapshot = createLaunchEnvironmentSnapshot([
      { source: 'process', values: { GNK_TOKEN: 'current', DSH_TOKEN: 'stale' } }, // rebrand:keep
    ])
    expect(snapshot.get('GNK_TOKEN')).toMatchObject({ value: 'current' })
  })

  it('rescues a GREENEEK_ name from its DEEPSEEK_ spelling across layers', () => { // rebrand:keep
    const snapshot = createLaunchEnvironmentSnapshot([
      { source: 'process', values: {} },
      { source: 'user-env', path: '/home/user/.gnk/env', values: { DEEPSEEK_API_KEY: 'old-key' } }, // rebrand:keep
    ])
    expect(snapshot.get('GREENEEK_API_KEY')).toMatchObject({ value: 'old-key', source: 'user-env', path: '/home/user/.gnk/env' })
  })

  it('keeps the source filter honest for aliased reads', () => {
    const snapshot = createLaunchEnvironmentSnapshot([
      { source: 'process', values: { DSH_TOKEN: 'legacy-value' } }, // rebrand:keep
    ])
    expect(snapshot.getFrom('GNK_TOKEN', ['user-env'])).toBeUndefined()
  })

  it('warns once per alias name, then stays quiet', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const snapshot = createLaunchEnvironmentSnapshot([
      { source: 'process', values: { DSH_TOKEN: 'legacy-value' } }, // rebrand:keep
    ])
    snapshot.get('GNK_TOKEN')
    snapshot.get('GNK_TOKEN')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('ends in v1.0')
  })

  it('leaves names without a legacy counterpart untouched', () => {
    const snapshot = createLaunchEnvironmentSnapshot([{ source: 'process', values: { HOME: '/nowhere' } }])
    expect(snapshot.get('GNK_UNRELATED')).toBeUndefined()
    expect(snapshot.get('HOME')).toMatchObject({ value: '/nowhere' })
  })
})

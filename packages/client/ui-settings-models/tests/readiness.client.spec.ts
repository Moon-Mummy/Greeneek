/** Pure first-run readiness projection over the shared Models join. */
import { describe, expect, it } from 'vitest'
import type { CredentialInfo } from '@greeneek/gnk-api-remotes/client'
import type { ModelsSettingsState, ProviderRow } from '../src/client/store.ts'
import { onboardingReadiness, providerSetupCandidate, providerUsable } from '../src/client/store.ts'

const missingCredential: CredentialInfo = { configured: false, writable: true }

function row(overrides: Partial<ProviderRow> = {}): ProviderRow {
  return {
    entry: {
      provider: 'openai',
      displayName: 'OpenAI',
      settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'openai'],
      active: true,
    },
    configured: true,
    removable: false,
    apiKeyEnv: 'OPENAI_API_KEY',
    credential: missingCredential,
    ...overrides,
  }
}

/** A second provider the user configured themselves. */
function otherRow(overrides: Partial<ProviderRow> = {}): ProviderRow {
  return {
    entry: {
      provider: 'hfai',
      displayName: 'HFAI',
      settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'hfai'],
      active: true,
    },
    configured: true,
    removable: true,
    apiKeyEnv: 'HFAI_API_KEY',
    credential: { configured: true, source: 'file', writable: true },
    ...overrides,
  }
}

function state(overrides: Partial<ModelsSettingsState> = {}): ModelsSettingsState {
  return {
    status: 'ready',
    error: null,
    credentialError: null,
    writable: true,
    rows: [row()],
    namespaces: new Map(),
    ...overrides,
  }
}

describe('providerUsable', () => {
  it('requires a registered route and a stored key for every named reference', () => {
    expect(providerUsable(otherRow())).toBe(true)
    expect(providerUsable(otherRow({ entry: { ...otherRow().entry, active: false } }))).toBe(false)
    expect(providerUsable(otherRow({ credential: missingCredential }))).toBe(false)
    expect(providerUsable(otherRow({ credential: undefined }))).toBe(false)
  })

  it('treats a reference-free registered route as provider-native authentication', () => {
    expect(providerUsable(otherRow({ apiKeyEnv: undefined, credential: undefined }))).toBe(true)
  })
})

describe('providerSetupCandidate', () => {
  it('offers rows this page could write a key for', () => {
    expect(providerSetupCandidate(row())).toBe(true)
    // Configured elsewhere: no settings address to write the profile into.
    expect(providerSetupCandidate(row({ entry: { ...row().entry, settingsNs: '' } }))).toBe(false)
    // The environment owns the credential, so there is no key to store here.
    expect(providerSetupCandidate(row({ credential: { configured: false, writable: false } }))).toBe(false)
  })

  it('reads the derived reference when the profile names none', () => {
    expect(providerSetupCandidate(row({
      apiKeyEnv: undefined,
      credential: undefined,
      derivedCredential: { configured: false, writable: false },
    }))).toBe(false)
    expect(providerSetupCandidate(row({
      apiKeyEnv: undefined,
      credential: undefined,
      derivedCredential: { configured: false, writable: true },
    }))).toBe(true)
  })
})

describe('onboardingReadiness', () => {
  it('waits for the first join and skips onboarding when no configurable adapter is mounted', () => {
    expect(onboardingReadiness(state({ status: 'idle', rows: [] }))).toEqual({ kind: 'loading' })
    expect(onboardingReadiness(state({ status: 'loading', rows: [] }))).toEqual({ kind: 'loading' })
    expect(onboardingReadiness(state({ rows: [] }))).toEqual({ kind: 'adapter-absent' })
    expect(onboardingReadiness(state({
      rows: [row({
        entry: {
          ...row().entry,
          settingsNs: '',
        },
      })],
    }))).toEqual({ kind: 'adapter-absent' })
  })

  it('reports a missing writable effective credential', () => {
    expect(onboardingReadiness(state())).toEqual({ kind: 'credential-missing' })
  })

  it('ends onboarding once any other registered provider can serve requests', () => {
    expect(onboardingReadiness(state({ rows: [row(), otherRow()] }))).toEqual({ kind: 'provider-ready' })
    // A provider the user cannot reach yet leaves the prompt in place.
    expect(onboardingReadiness(state({
      rows: [row(), otherRow({ credential: missingCredential })],
    }))).toEqual({ kind: 'credential-missing' })
  })

  it('accepts file and process-environment credentials without prompting', () => {
    expect(onboardingReadiness(state({
      rows: [row({ credential: { configured: true, source: 'file', writable: true } })],
    }))).toEqual({ kind: 'provider-ready' })
    expect(onboardingReadiness(state({
      rows: [row({ credential: { configured: true, source: 'env', writable: false } })],
    }))).toEqual({ kind: 'provider-ready' })
  })

  it('turns missing capabilities into diagnostics that never block the product', () => {
    expect(onboardingReadiness(state({ status: 'error', error: 'settings down' }))).toEqual({
      kind: 'unavailable',
      reason: 'load-failed',
    })
    expect(onboardingReadiness(state({
      credentialError: 'credentials service is absent',
    }))).toEqual({
      kind: 'unavailable',
      reason: 'credentials-unavailable',
    })
    expect(onboardingReadiness(state({
      rows: [row({ credential: undefined })],
    }))).toEqual({ kind: 'unavailable', reason: 'credentials-unavailable' })
    expect(onboardingReadiness(state({
      rows: [row({ credential: { configured: false, writable: false } })],
    }))).toEqual({ kind: 'unavailable', reason: 'credential-read-only' })
    expect(onboardingReadiness(state({ writable: false }))).toEqual({
      kind: 'unavailable',
      reason: 'settings-read-only',
    })
  })
})

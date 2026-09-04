// @vitest-environment jsdom
/** First-run provider-setup prompt behavior over the shared Models join. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Schema from '@greeneek/schemastery'
import type { SettingsNamespaceView } from '@greeneek/gnk-api-remotes/client'
import type { JsonValue } from '@greeneek/gnk-util-values'
import { bindSnapshotSelector, RemoteError } from '@greeneek/gnk-client-test-runtime'
import { initialOnboardingProvider, ProviderOnboardingDialog } from '../src/client/ProviderOnboardingDialog.tsx'
import type { ProviderOnboardingDialogProps } from '../src/client/ProviderOnboardingDialog.tsx'
import { SettingsDescribeMirror } from '@greeneek/gnk-client-ui-settings/src/client/settings-mirror.ts'
import { ModelsSettingsStore } from '../src/client/store.ts'
import type { ProviderRow } from '../src/client/store.ts'
import { createModelsOperations } from '../src/client/operations.ts'
import { en } from '../src/client/locales.ts'
import { settingsSchema } from './settings-schema.client.ts'

afterEach(() => {
  cleanup()
  document.getElementById('root')?.remove()
})

/** Credentials answers over the Remote carrier, which has no envelope. */
function remoteOk<T>(value: T) {
  return { ok: true as const, value }
}
function remoteFail(message: string) {
  return { ok: false as const, error: new RemoteError('gateway/internal', message, {}) }
}

/** The routes the shipped multi-provider adapter offers a first-run user. */
const ROUTES = [
  { provider: 'openai', displayName: 'OpenAI', keyRef: 'OPENAI_API_KEY' },
  { provider: 'anthropic', displayName: 'Anthropic', keyRef: 'ANTHROPIC_API_KEY' },
] as const

const ProviderProfile = Schema.object({
  apiKeyEnv: Schema.string().role('credential-ref'),
  baseURL: Schema.string().pattern(/^https:\/\//),
  api: Schema.union(['openai-chat', 'anthropic-messages']),
  models: Schema.array(Schema.object({
    id: Schema.string().required(),
    name: Schema.string(),
    contextWindow: Schema.number().step(1).min(1),
  })),
})

const PiAiConfig = Schema.object({
  providers: Schema.dict(ProviderProfile),
})

type AttentionSnapshot = Parameters<Parameters<ProviderOnboardingDialogProps['useSessionPendingInteraction']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionPendingInteraction: ProviderOnboardingDialogProps['useSessionPendingInteraction'] = selector =>
  selector(noAttention)

function piAiNamespace(apiKeyEnv: string | null): SettingsNamespaceView {
  const value = {
    providers: Object.fromEntries(ROUTES.map(route => [
      route.provider,
      apiKeyEnv === null ? {} : { apiKeyEnv: apiKeyEnv === 'default' ? route.keyRef : apiKeyEnv },
    ])),
  }
  return {
    ns: 'llm-pi-ai',
    schema: JSON.parse(JSON.stringify(PiAiConfig.toJSON())) as JsonValue,
    value,
    base: value,
    user: {},
    applies: 'live',
    secrets: [],
    revision: 0,
  }
}

function harness(options: {
  provider?: boolean
  providerSettingsNs?: string
  providerActive?: boolean
  settingsNamespace?: boolean
  apiKeyEnv?: string | null
  configured?: (ref: string) => boolean
  credential?: { source?: string; writable: boolean }
  describeFailure?: string
  settingsWritable?: boolean
  providersFailure?: string
  setFailure?: string
} = {}) {
  if (document.getElementById('root') === null) {
    const appRoot = document.createElement('div')
    appRoot.id = 'root'
    document.body.append(appRoot)
  }
  const configuredRefs = new Set<string>()
  const configured = options.configured ?? ((ref: string) => configuredRefs.has(ref))
  const apiKeyEnv = options.apiKeyEnv === undefined ? 'default' : options.apiKeyEnv
  const mutate = vi.fn(() => Promise.resolve(remoteOk(piAiNamespace(apiKeyEnv))))
  const set = vi.fn((ref: string, _value: string) => {
    if (options.setFailure !== undefined) return Promise.resolve(remoteFail(options.setFailure))
    configuredRefs.add(ref)
    return Promise.resolve(remoteOk(undefined))
  })
  const face = {
    llm: {
      listProviders: () => {
        if (options.providersFailure !== undefined) return Promise.resolve(remoteFail(options.providersFailure))
        return Promise.resolve(remoteOk(
          options.provider === false || options.providerActive === false
            ? []
            : ROUTES.map(route => ({ id: route.provider, name: route.displayName })),
        ))
      },
      listConfigurableProviders: () => Promise.resolve(remoteOk(
        options.provider === false
          ? []
          : ROUTES.map(route => ({
            provider: route.provider,
            displayName: route.displayName,
            settingsNs: options.providerSettingsNs ?? 'llm-pi-ai',
            settingsPath: ['providers', route.provider],
          })),
      )),
      discoverModels: () => Promise.resolve(remoteOk([])),
    },
    settings: {
      describe: () => Promise.resolve(remoteOk({
        writable: options.settingsWritable ?? true,
        hasDocument: false,
        namespaces: options.settingsNamespace === false ? [] : [piAiNamespace(apiKeyEnv)],
      })),
      mutate,
    },
    credentials: {
      describe: () => options.describeFailure === undefined
        ? Promise.resolve(remoteOk(Object.fromEntries(ROUTES.map(route => [
          route.keyRef,
          {
            configured: configured(route.keyRef),
            ...configured(route.keyRef) && options.credential?.source !== undefined
              ? { source: options.credential.source }
              : {},
            writable: options.credential?.writable ?? true,
          },
        ]))))
        : Promise.resolve(remoteFail(options.describeFailure)),
      set,
    },
  }
  // The page plugin's context, scripted down to the namespaces it reaches.
  const ctx = { remote: face } as never
  const operations = createModelsOperations(ctx)
  const controller = new ModelsSettingsStore(ctx, settingsSchema, new SettingsDescribeMirror(ctx))
  const openSection = vi.fn()
  const complete = vi.fn()
  const unusedHook = (() => { throw new Error('unused standard hook') }) as never
  const props: ProviderOnboardingDialogProps = {
    stepId: 'provider-setup',
    complete,
    openSection,
    useSessions: unusedHook,
    useSessionPendingInteraction,
    useWorkspaces: unusedHook,
    controller,
    useModels: bindSnapshotSelector(controller.store),
    operations,
    schema: settingsSchema,
    t: key => en[key],
  }
  return {
    controller, complete, openSection, props, mutate, set,
    configure: (ref = ROUTES[0].keyRef) => { configuredRefs.add(ref) },
  }
}

describe('initialOnboardingProvider', () => {
  it('opens on the first route the directory lists, and on none when empty', () => {
    const candidate = (provider: string): ProviderRow => ({
      entry: { provider, displayName: provider, settingsNs: 'llm-pi-ai', settingsPath: [], active: true },
      configured: false,
      removable: false,
      apiKeyEnv: undefined,
      credential: undefined,
    })
    expect(initialOnboardingProvider([candidate('openai'), candidate('anthropic')])).toBe('openai')
    expect(initialOnboardingProvider([])).toBeUndefined()
  })
})

describe('ProviderOnboardingDialog', () => {
  it('renders when the shell root is absent', async () => {
    const h = harness()
    document.getElementById('root')!.remove()
    render(<ProviderOnboardingDialog {...h.props} />)
    expect(await screen.findByRole('dialog', { name: en.onboardingTitle })).toBeTruthy()
  })

  it('loads a credential-only modal, inerts the product, and focuses the key', async () => {
    const h = harness()
    render(<ProviderOnboardingDialog {...h.props} />)
    expect(await screen.findByRole('dialog', { name: en.onboardingTitle })).toBeTruthy()
    expect(document.getElementById('root')?.inert).toBe(true)
    expect(screen.getByText(en.onboardingDescription)).toBeTruthy()
    const key = screen.getByLabelText<HTMLInputElement>(en.keyInput)
    await waitFor(() => { expect(document.activeElement).toBe(key) })
    expect(screen.queryByText(en.customized)).toBeNull()
  })

  it('offers every configurable route and opens on the first one', async () => {
    const h = harness()
    render(<ProviderOnboardingDialog {...h.props} />)
    await screen.findByRole('dialog')
    const chooser = screen.getByLabelText<HTMLSelectElement>(en.provider)
    expect([...chooser.options].map(option => option.value)).toEqual(['openai', 'anthropic'])
    expect(chooser.value).toBe('openai')
  })

  it('switches provider without carrying the previous route\'s draft key', async () => {
    const h = harness()
    render(<ProviderOnboardingDialog {...h.props} />)
    await screen.findByRole('dialog')
    fireEvent.change(screen.getByLabelText(en.keyInput), { target: { value: 'sk-openai' } })
    fireEvent.change(screen.getByLabelText(en.provider), { target: { value: 'anthropic' } })
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>(en.keyInput).value).toBe('')
    })
    fireEvent.change(screen.getByLabelText(en.keyInput), { target: { value: 'sk-anthropic' } })
    fireEvent.click(screen.getByRole('button', { name: en.onboardingSave }))
    await waitFor(() => { expect(h.set).toHaveBeenCalledOnce() })
    expect(h.set.mock.calls[0]).toEqual(['ANTHROPIC_API_KEY', 'sk-anthropic'])
  })

  it('cannot be dismissed implicitly and restores the previous inert state', async () => {
    const h = harness()
    const appRoot = document.getElementById('root')!
    appRoot.inert = true
    const view = render(<ProviderOnboardingDialog {...h.props} />)
    await screen.findByRole('dialog')

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('[class*="mask"]')!)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(h.complete).not.toHaveBeenCalled()

    view.unmount()
    expect(appRoot.inert).toBe(true)
  })

  it('requires a non-blank key before Save and continue is available', async () => {
    const h = harness()
    render(<ProviderOnboardingDialog {...h.props} />)
    await screen.findByRole('dialog')
    const save = screen.getByRole<HTMLButtonElement>('button', { name: en.onboardingSave })
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(en.keyInput), { target: { value: '   ' } })
    expect(save.disabled).toBe(true)
    expect(screen.getByText(en.keyRequired)).toBeTruthy()
    expect(h.set).not.toHaveBeenCalled()
  })

  it('keeps the modal open and reports a refused credential write', async () => {
    for (const [options, message] of [
      [{ setFailure: 'credential was rejected' }, 'credential was rejected'],
    ] as const) {
      const h = harness(options)
      const view = render(<ProviderOnboardingDialog {...h.props} />)
      await screen.findByRole('dialog')
      fireEvent.change(screen.getByLabelText(en.keyInput), { target: { value: 'sk-live' } })
      fireEvent.click(screen.getByRole('button', { name: en.onboardingSave }))
      expect(await screen.findByText(message)).toBeTruthy()
      expect(screen.getByRole('dialog')).toBeTruthy()
      expect(screen.getByRole<HTMLButtonElement>('button', { name: en.onboardingSave }).disabled).toBe(false)
      expect(h.complete).not.toHaveBeenCalled()
      expect(h.mutate).not.toHaveBeenCalled()
      view.unmount()
    }
  })

  it('allows configure-later dismissal without opening settings', async () => {
    const h = harness()
    render(<ProviderOnboardingDialog {...h.props} />)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: en.onboardingLater }))
    expect(h.complete).toHaveBeenCalledOnce()
    expect(h.openSection).not.toHaveBeenCalled()
    expect(h.set).not.toHaveBeenCalled()
    expect(h.mutate).not.toHaveBeenCalled()
  })

  it('does not block the product when provider setup is unavailable', async () => {
    for (const h of [
      harness({ describeFailure: 'credentials service is absent' }),
      harness({ credential: { writable: false } }),
      harness({ settingsWritable: false }),
      harness({ providersFailure: 'the provider directory is unavailable' }),
      harness({ settingsNamespace: false }),
      harness({ apiKeyEnv: null }),
    ]) {
      const view = render(<ProviderOnboardingDialog {...h.props} />)
      await act(async () => { await h.controller.load() })
      expect(screen.queryByRole('dialog')).toBeNull()
      await waitFor(() => { expect(h.complete).toHaveBeenCalledOnce() })
      expect(h.openSection).not.toHaveBeenCalled()
      view.unmount()
    }
  })

  it('skips an absent adapter and an already-configured environment credential', async () => {
    for (const h of [
      harness({ provider: false }),
      harness({ providerSettingsNs: '' }),
      harness({ configured: () => true, credential: { source: 'env', writable: false } }),
    ]) {
      const view = render(<ProviderOnboardingDialog {...h.props} />)
      await act(async () => { await h.controller.load() })
      expect(screen.queryByRole('dialog')).toBeNull()
      await waitFor(() => { expect(h.complete).toHaveBeenCalledOnce() })
      view.unmount()
    }
  })

  it('closes when an external credential invalidation refreshes the shared join', async () => {
    const h = harness()
    render(<ProviderOnboardingDialog {...h.props} />)
    await screen.findByRole('dialog')
    h.configure()
    await act(async () => { await h.controller.load() })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(h.complete).toHaveBeenCalledOnce()
  })
})

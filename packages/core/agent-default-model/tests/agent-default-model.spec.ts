/** Default Agent model settings layered over a real settings provider. */

import { describe, expect, it } from 'vitest'
import { Context } from '@greeneek/cordis'
import AgentDefaultModelConfig, { AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE } from '../src/index.ts'
import { SettingsProvider } from '@greeneek/gnk-settings'
import type { SettingsNamespace } from '@greeneek/gnk-settings'
import { LlmAdapter, LlmRuntime, ReasoningEffortId } from '@greeneek/gnk-llm'
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, StreamChunk } from '@greeneek/gnk-llm'

/** The smallest real provider: one in-memory document, always writable. */
class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

async function boot(): Promise<{
  ctx: Context
  settingsFiber: Context['fiber']
  defaultModel: AgentDefaultModelConfig
}> {
  const ctx = new Context()
  const settingsFiber = ctx.plugin(MemorySettings)
  await settingsFiber.await()
  await ctx.plugin(AgentDefaultModelConfig, {
    provider: 'pinned-gateway',
    model: 'pinned-large',
  })
  return { ctx, settingsFiber, defaultModel: ctx.agentDefaultModel }
}

/** An adapter that advertises a fixed catalog, or fails to answer one. */
class CatalogAdapter extends LlmAdapter {
  constructor(private readonly models: readonly LlmModelInfo[] | Error) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: provider }
  }

  override listModels(): Promise<readonly LlmModelInfo[]> {
    return this.models instanceof Error ? Promise.reject(this.models) : Promise.resolve(this.models)
  }

  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    // Default-resolution tests never enter provider streaming.
  }
}

function model(provider: string, id: string): LlmModelInfo {
  return { provider, id, name: id }
}

/** A harness that pins no provider: what this build actually ships. */
async function bootUnpinned(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(AgentDefaultModelConfig, {})
  return ctx
}

describe('AgentDefaultModelConfig', () => {
  it('resolves the user layer over the composition entry', async () => {
    const bench = await boot()
    expect(bench.defaultModel.currentSelection()).toEqual({
      provider: 'pinned-gateway', model: 'pinned-large',
    })

    await bench.defaultModel.saveSelection({
      provider: 'acme-gateway', model: 'acme-large', reasoningEffort: ReasoningEffortId('high'),
    })
    expect(bench.defaultModel.currentSelection()).toEqual({
      provider: 'acme-gateway', model: 'acme-large', reasoningEffort: 'high',
    })
    await bench.ctx.fiber.dispose()
  })

  it('clears a stored effort when the saved selection has none', async () => {
    const bench = await boot()
    await bench.defaultModel.saveSelection({
      provider: 'acme-gateway', model: 'acme-large', reasoningEffort: ReasoningEffortId('high'),
    })
    await bench.defaultModel.saveSelection({ provider: 'acme-gateway', model: 'acme-plain' })
    expect(bench.defaultModel.currentSelection()).toEqual({ provider: 'acme-gateway', model: 'acme-plain' })
    await bench.ctx.fiber.dispose()
  })

  it('layers a hand-written partial section over the entry', async () => {
    const bench = await boot()
    await bench.settingsFiber.ctx.settings.replace(AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE, {
      model: 'pinned-reasoner',
    })
    expect(bench.defaultModel.currentSelection()).toEqual({
      provider: 'pinned-gateway', model: 'pinned-reasoner',
    })
    await bench.ctx.fiber.dispose()
  })

  it('falls back to the composition entry when the settings provider detaches', async () => {
    const bench = await boot()
    await bench.defaultModel.saveSelection({ provider: 'acme-gateway', model: 'acme-large' })
    expect(bench.defaultModel.currentSelection()?.provider).toBe('acme-gateway')
    await bench.settingsFiber.dispose()
    expect(bench.defaultModel.currentSelection()).toEqual({
      provider: 'pinned-gateway', model: 'pinned-large',
    })
    await bench.ctx.fiber.dispose()
  })

  it('keeps the composition entry when no settings provider is mounted', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentDefaultModelConfig, { provider: 'p', model: 'm' })
    await ctx.agentDefaultModel.saveSelection({ provider: 'other', model: 'other' })
    expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'p', model: 'm' })
    await ctx.fiber.dispose()
  })

  it('configures no default until the user activates a route', async () => {
    const ctx = await bootUnpinned()
    // A build that ships no provider of its own states no default, rather than
    // naming a route nothing serves.
    expect(ctx.agentDefaultModel.currentSelection()).toBeUndefined()
    expect(await ctx.agentDefaultModel.resolveSelection()).toBeUndefined()
    await ctx.fiber.dispose()
  })

  it('resolves the first model of the first registered route once one exists', async () => {
    const ctx = await bootUnpinned()
    ctx.llm.registerAdapter(['acme'], new CatalogAdapter([model('acme', 'acme-large'), model('acme', 'acme-small')]))
    ctx.llm.registerAdapter(['other'], new CatalogAdapter([model('other', 'other-large')]))
    // The user supplied one key; a fresh Agent opens on that route without
    // anyone having to also record it as the default.
    expect(await ctx.agentDefaultModel.resolveSelection()).toEqual({ provider: 'acme', model: 'acme-large' })
    expect(ctx.agentDefaultModel.currentSelection()).toBeUndefined()
    await ctx.fiber.dispose()
  })

  it('prefers the configured default over the registry', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(AgentDefaultModelConfig, { provider: 'pinned', model: 'pinned-large' })
    ctx.llm.registerAdapter(['acme'], new CatalogAdapter([model('acme', 'acme-large')]))
    expect(await ctx.agentDefaultModel.resolveSelection()).toEqual({ provider: 'pinned', model: 'pinned-large' })
    await ctx.fiber.dispose()
  })

  it('skips a route that cannot answer its own catalog', async () => {
    const ctx = await bootUnpinned()
    // A gateway that is down must not hide the working routes behind it.
    ctx.llm.registerAdapter(['broken'], new CatalogAdapter(new Error('catalog offline')))
    ctx.llm.registerAdapter(['empty'], new CatalogAdapter([]))
    ctx.llm.registerAdapter(['acme'], new CatalogAdapter([model('acme', 'acme-large')]))
    expect(await ctx.agentDefaultModel.resolveSelection()).toEqual({ provider: 'acme', model: 'acme-large' })
    await ctx.fiber.dispose()
  })

  it('resolves nothing without an adapter registry at all', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentDefaultModelConfig, {})
    expect(await ctx.agentDefaultModel.resolveSelection()).toBeUndefined()
    await ctx.fiber.dispose()
  })

  it('treats a half-written section as no selection at all', async () => {
    const ctx = new Context()
    const settingsFiber = ctx.plugin(MemorySettings)
    await settingsFiber.await()
    await ctx.plugin(AgentDefaultModelConfig, {})
    // The pair is what a request needs, so naming one half describes nothing.
    await ctx.settings.replace(AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE, { provider: 'acme' })
    expect(ctx.agentDefaultModel.currentSelection()).toBeUndefined()
    await ctx.settings.replace(AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE, { model: 'acme-large' })
    expect(ctx.agentDefaultModel.currentSelection()).toBeUndefined()
    await ctx.settings.replace(AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE, { provider: 'acme', model: 'acme-large' })
    expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'acme', model: 'acme-large' })
    await ctx.fiber.dispose()
  })
})

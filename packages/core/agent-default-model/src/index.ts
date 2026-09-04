/**
 * Default model selection for an Agent without a session-specific selection.
 *
 * The default is *configuration, not a shipped fact*: a deployment that pins a
 * provider gets it, and one that pins nothing resolves the default from
 * whatever routes the user's own keys activated. That is what lets the harness
 * ship no provider of its own — see
 * {@link AgentDefaultModelConfig.resolveSelection}, which reads the live
 * adapter registry rather than a placeholder route.
 *
 * @module @greeneek/gnk-agent-default-model
 */

import { Context, Service } from '@greeneek/cordis'
import z from '@greeneek/schemastery'
import type { ModelSelection } from '@greeneek/gnk-agent'
import { ReasoningEffortId } from '@greeneek/gnk-llm'
import type {} from '@greeneek/gnk-settings'

declare module '@greeneek/cordis' {
  interface Context {
    /** Default model selection for Agents created without an explicit model. */
    agentDefaultModel: AgentDefaultModelConfig
  }
}

/** Settings namespace carrying the default model selection for future Agents. */
export const AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE = 'agent-default-model'

/**
 * Stored and composed default model selection. A first-run deployment has no
 * selection at all, so both halves of the route are optional here; a section
 * carrying only one of them describes no usable default (see {@link selection}).
 */
export interface AgentDefaultModelSettings {
  /** Registered provider route. */
  provider?: string
  /** Provider-owned model id. */
  model?: string
  /** Adapter-owned reasoning effort, or provider/default behavior when absent. */
  reasoningEffort?: string
}

/**
 * Schema of the default Agent model settings section. Neither half of the
 * route is required: a first-run document has no selection at all, and the
 * page that writes one always writes the pair together.
 */
export const AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA: z<AgentDefaultModelSettings> = z.object({
  provider: z.string(),
  model: z.string(),
  reasoningEffort: z.string(),
})

/**
 * Composition entry for the default model selection. Both halves are optional:
 * a deployment that ships no provider of its own pins nothing, and the default
 * is then resolved live from the adapter registry by
 * {@link AgentDefaultModelConfig.resolveSelection}. Pinning a route no mounted
 * adapter serves would only fail at the first request, so absence is modelled
 * as absence rather than as a placeholder route.
 */
export interface Config {
  /** Registered provider route; omitted defers to the user's own configuration. */
  provider?: string
  /** Provider-owned model id; omitted defers to the user's own configuration. */
  model?: string
}

/**
 * Project stored settings onto the Agent-facing selection type. A section that
 * names only one half of the route describes no usable selection: the pair is
 * what a request needs, so a partial answer is reported as none at all.
 */
function selection(settings: Partial<AgentDefaultModelSettings>): ModelSelection | undefined {
  if (settings.provider === undefined || settings.model === undefined) return undefined
  return {
    provider: settings.provider,
    model: settings.model,
    ...settings.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: ReasoningEffortId(settings.reasoningEffort) },
  }
}

/**
 * Owns the default model selection independently of any Host or transport.
 * The composition entry remains usable without a settings provider; when one
 * is mounted, its user layer is read live.
 */
export class AgentDefaultModelConfig extends Service {
  static Config: z<Config> = z.object({
    provider: z.string(),
    model: z.string(),
  })

  private source: () => AgentDefaultModelSettings

  constructor(ctx: Context, config: Config) {
    super(ctx, 'agentDefaultModel')
    const entry: AgentDefaultModelSettings = {
      ...config.provider === undefined ? {} : { provider: config.provider },
      ...config.model === undefined ? {} : { model: config.model },
    }
    this.source = () => entry
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.settings.installSection(ctx, AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE, AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA, entry, {
        setSource: (current) => { this.source = current },
        // Every consumer reads through currentSelection(), so no registration-level fact
        // needs rebuilding when the settings document changes.
        onChange: () => {},
      })
    })
  }

  /**
   * Read the configured default model selection: the settings layer over the
   * composition entry, without consulting the adapter registry.
   * @returns a detached selection, or undefined when no layer names a complete
   * provider/model pair — a deployment that ships no provider of its own until
   * the user configures one.
   */
  currentSelection(): ModelSelection | undefined {
    return selection(this.source())
  }

  /**
   * The selection a fresh Agent should start on: the configured default when
   * one exists, otherwise the first model of the first registered provider
   * route.
   *
   * The fallback is what makes a harness that pins no provider usable the
   * moment the user configures one: a deployment ships adapters, the user
   * supplies the key that activates a route, and a new session opens on it
   * without anyone having to also state it as the default. It is deliberately
   * a *live* read rather than a value captured at mount, because routes come
   * and go with the settings document.
   *
   * Provider order is the registry's own registration order, and the model is
   * the first the route advertises; both are the same order the model picker
   * shows, so the implicit default is the one a user would read as first.
   * @param signal - cancellation for the catalog reads this resolution makes.
   * @returns the selection, or undefined while no route can serve a request.
   */
  async resolveSelection(signal?: AbortSignal): Promise<ModelSelection | undefined> {
    const configured = this.currentSelection()
    if (configured !== undefined) return configured
    const llm = this.ctx.get('llm')
    if (llm === undefined) return undefined
    for (const provider of llm.listProviders()) {
      let models: Awaited<ReturnType<typeof llm.listModels>>
      try {
        models = await llm.listModels(provider.id)
      } catch {
        // An adapter that cannot answer its own catalog (a gateway that is
        // down, a route whose key was just removed) must not hide the routes
        // behind it: the next provider gets the same chance.
        continue
      }
      signal?.throwIfAborted()
      const first = models[0]
      if (first !== undefined) return { provider: provider.id, model: first.id }
    }
    return undefined
  }

  /**
   * Save the complete default model selection. A deployment without a settings
   * provider keeps its composition entry.
   * @param next - resolved selection accepted by an entry point.
   * @returns fulfillment after the optional settings write settles.
   */
  async saveSelection(next: ModelSelection): Promise<void> {
    await this.ctx.get('settings')?.replace(AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE, {
      provider: next.provider,
      model: next.model,
      ...next.reasoningEffort === undefined ? {} : { reasoningEffort: String(next.reasoningEffort) },
    })
  }
}

export default AgentDefaultModelConfig

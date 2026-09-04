/**
 * Greeneek LLM API extension registry: plugins own independent top-level request
 * fields while the official adapter performs one preparation and acceptance transaction.
 * @module @greeneek/gnk-greeneek-llm-api-extensions
 */

import { Context, Service } from '@greeneek/cordis'
import type {
  GreeneekLlmApiExtensionMap,
  GreeneekLlmApiExtensionProvider,
  GreeneekLlmApiExtensionRequest,
  GreeneekLlmApiJson,
  PreparedGreeneekLlmApiExtensions,
} from './types.ts'

export type * from './types.ts'

declare module '@greeneek/cordis' {
  interface Context {
    greeneekLlmApiExtensions: GreeneekLlmApiExtensionRegistry
  }
}

interface ErasedProvider {
  prepare(request: GreeneekLlmApiExtensionRequest):
    | { readonly value: GreeneekLlmApiJson; accept?(): void | Promise<void> }
    | undefined
    | Promise<{ readonly value: GreeneekLlmApiJson; accept?(): void | Promise<void> } | undefined>
}

/** Recursively freeze a fresh structured clone. */
function freezeJson<T extends GreeneekLlmApiJson>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Array.isArray(value) ? value : Object.values(value)) freezeJson(child)
    Object.freeze(value)
  }
  return value
}

/** Settle every acceptance callback before reporting failures. */
async function acceptAll(callbacks: readonly (() => void | Promise<void>)[]): Promise<void> {
  const outcomes = await Promise.allSettled(callbacks.map(callback => Promise.resolve().then(callback)))
  const failures: unknown[] = outcomes
    .filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')
    .map(outcome => outcome.reason as unknown)
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'Greeneek LLM API extension acceptance failed')
}

/** Stop awaiting provider work when the containing model request is cancelled. */
async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  const aborted = Promise.withResolvers<never>()
  const onAbort = (): void => { aborted.reject(signal.reason) }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    const result = await Promise.race([work, aborted.promise])
    signal.throwIfAborted()
    return result
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

/** Registry of independently owned top-level fields for official Greeneek requests. */
export class GreeneekLlmApiExtensionRegistry extends Service {
  private readonly providers = new Map<string, ErasedProvider>()

  constructor(ctx: Context) {
    super(ctx, 'greeneekLlmApiExtensions')
  }

  /**
   * Register the sole provider of one top-level request field. Registration is effect-scoped.
   * @param field - declaration-merged field owned by the provider.
   * @param provider - request-time field preparation and optional acceptance behavior.
   * @returns disposer that releases the field.
   */
  register<K extends keyof GreeneekLlmApiExtensionMap>(
    field: K,
    provider: GreeneekLlmApiExtensionProvider<GreeneekLlmApiExtensionMap[K]>,
  ): () => Promise<void> {
    const fieldName = field as string
    if (fieldName.length === 0 || fieldName.trim() !== fieldName) {
      throw new Error('greeneek-llm-api-extensions: field must be a non-blank trimmed string')
    }
    const providers = this.providers
    const erased = provider as ErasedProvider
    const dispose = this.ctx.effect(() => {
      if (providers.has(fieldName)) {
        throw new Error(`greeneek-llm-api-extensions: field ${JSON.stringify(fieldName)} is already registered`)
      }
      providers.set(fieldName, erased)
      return () => {
        providers.delete(fieldName)
      }
    }, `greeneekLlmApiExtensions.register(${JSON.stringify(fieldName)})`)
    return dispose
  }

  /**
   * Prepare every currently registered field from one immutable base request.
   * Preparation failures reject before HTTP dispatch. Field values are cloned and frozen;
   * providers retain no mutable alias to the outgoing request.
   * @param request - exact serialized request facts before extension fields.
   * @returns detached fields and their idempotent joint acceptance transaction.
   */
  async prepare(request: GreeneekLlmApiExtensionRequest): Promise<PreparedGreeneekLlmApiExtensions> {
    request.signal.throwIfAborted()
    const entries = [...this.providers.entries()]
    const prepared = await abortable(Promise.all(entries.map(async ([field, provider]) => ({
      field,
      result: await provider.prepare(request),
    }))), request.signal)
    const fields: Record<string, GreeneekLlmApiJson> = Object.create(null) as Record<string, GreeneekLlmApiJson>
    const callbacks: Array<() => void | Promise<void>> = []
    for (const { field, result } of prepared) {
      if (result === undefined) continue
      fields[field] = freezeJson(structuredClone(result.value))
      const accept = result.accept
      if (accept !== undefined) callbacks.push(accept.bind(result))
    }
    Object.freeze(fields)
    let acceptance: Promise<void> | undefined
    return {
      fields,
      accept: () => acceptance ??= acceptAll(callbacks),
    }
  }
}

export default GreeneekLlmApiExtensionRegistry

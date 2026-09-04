/**
 * Tool-independent shell environment plugin: owns the `ctx.shellEnv` registry of
 * trusted, per-execution `GNK_*` variables consumed by the model-facing shell
 * tools (`gnk-tool-bash`, `gnk-tool-pwsh`). Built-in shell facts are owned by
 * the registry itself while plugins can register additional, enumerable facts
 * with effect-scoped disposal.
 *
 * @module @greeneek/gnk-shell-env
 */

import { Service, type Context } from '@greeneek/cordis'
import z from '@greeneek/schemastery'
import { GNK_ENV_PREFIX } from '@greeneek/gnk-shell'
import type { GnkEnvironment, GnkEnvironmentKey } from '@greeneek/gnk-shell'
import { GNK_HOME_ENV, resolveGnkHome } from '@greeneek/gnk-home-paths'
import type { ToolExecution } from '@greeneek/gnk-tools'

declare module '@greeneek/cordis' {
  interface Context {
    shellEnv: ShellEnvRegistry
  }
}

export const name = 'shell-env'
export const inject: string[] = []

/** Plugin config (all optional — the built-in facts resolve without defaults). */
export interface Config {
  /** Greeneek Harness home directory exposed as `GNK_HOME`; defaults to `$GNK_HOME` or `~/.gnk`. */
  gnkHome?: string
}

/** Runtime configuration schema for the shell-env plugin. */
export const Config: z<Config> = z.object({
  gnkHome: z.string(),
})

/** Model-visible metadata for one managed `GNK_*` environment variable. */
export interface BashEnvVariable {
  /** Concise description of the environment fact represented by the variable. */
  description: string
}

/**
 * A plugin contribution to the managed environment of each model shell call.
 * Declared keys make ownership conflicts detectable before the first command;
 * `resolve` computes only the values available for the current execution.
 */
export interface BashEnvContributor {
  /** Stable contributor name used in diagnostics and duplicate detection. */
  name: string
  /** Complete set of `GNK_*` keys this contributor may return. */
  variables: Readonly<Record<GnkEnvironmentKey, BashEnvVariable>>
  /**
   * Resolve this contributor's available values for one tool execution.
   * @param execution - the shell tool execution and its optional calling agent.
   * @returns a partial map containing only keys declared in {@link variables}.
   */
  resolve(execution: ToolExecution): Readonly<Partial<Record<GnkEnvironmentKey, string>>>
}

/** An enumerable declaration returned by {@link ShellEnvRegistry.list}. */
export interface BashEnvVariableInfo extends BashEnvVariable {
  /** Contributor that owns the variable. */
  contributor: string
  /** Declared `GNK_*` environment variable name. */
  key: GnkEnvironmentKey
}

const GNK_SHELL_KEY = `${GNK_ENV_PREFIX}SHELL` as const
const GNK_SESSION_ID_KEY = `${GNK_ENV_PREFIX}SESSION_ID` as const
const RESERVED_BASH_ENV_KEYS = new Set<GnkEnvironmentKey>([
  GNK_HOME_ENV,
  GNK_SHELL_KEY,
  GNK_SESSION_ID_KEY,
])
const BASH_ENV_KEY_SUFFIX = /^[A-Z][A-Z0-9_]*$/

/**
 * Registry (`ctx.shellEnv`) for trusted, per-execution `GNK_*` variables.
 * The namespace is rebuilt for every model shell call: ambient `GNK_*` values
 * are discarded by the executor, then the registry's current snapshot is
 * injected. Built-in shell facts remain owned by the registry itself while
 * plugins can register additional, enumerable facts with effect-scoped
 * disposal.
 */
export class ShellEnvRegistry extends Service {
  private readonly contributors = new Map<string, BashEnvContributor>()
  private readonly keyOwners = new Map<GnkEnvironmentKey, string>()
  private readonly gnkHome: string

  /**
   * Create and install the `ctx.shellEnv` service.
   * @param ctx - Cordis context that owns the service and registrations.
   * @param config - home-directory configuration for the built-in variables.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'shellEnv')
    this.gnkHome = resolveGnkHome(config.gnkHome)
  }

  /**
   * Register one environment contributor. Names and keys are unique; built-in
   * keys are reserved. Registration is disposed with the calling plugin fiber.
   * @param contributor - declared key ownership and per-execution resolver.
   * @returns the disposer that unregisters the contribution.
   */
  register(contributor: BashEnvContributor): () => void {
    const dispose = this.ctx.effect(function* (this: ShellEnvRegistry) {
      if (contributor.name.trim().length === 0) {
        throw new Error('bash env contributor name must be non-empty')
      }
      if (this.contributors.has(contributor.name)) {
        throw new Error(`bash env contributor "${contributor.name}" is already registered`)
      }

      const variables = Object.entries(contributor.variables) as [GnkEnvironmentKey, BashEnvVariable][]
      for (const [key, variable] of variables) {
        if (!key.startsWith(GNK_ENV_PREFIX)
          || !BASH_ENV_KEY_SUFFIX.test(key.slice(GNK_ENV_PREFIX.length))) {
          throw new Error(`bash env contributor "${contributor.name}" declared invalid key "${key}"`)
        }
        if (RESERVED_BASH_ENV_KEYS.has(key)) {
          throw new Error(`bash env contributor "${contributor.name}" cannot own reserved key "${key}"`)
        }
        if (variable.description.trim().length === 0) {
          throw new Error(`bash env contributor "${contributor.name}" must describe "${key}"`)
        }
        const owner = this.keyOwners.get(key)
        if (owner !== undefined) {
          throw new Error(`bash env key "${key}" is already owned by contributor "${owner}"; contributor "${contributor.name}" cannot also own it`)
        }
      }

      this.contributors.set(contributor.name, contributor)
      for (const [key] of variables) this.keyOwners.set(key, contributor.name)
      yield () => {
        this.contributors.delete(contributor.name)
        for (const [key] of variables) this.keyOwners.delete(key)
      }
    }.bind(this), 'bashEnv.register()')
    return () => void dispose()
  }

  /**
   * Build the trusted `GNK_*` snapshot for one shell tool execution.
   * @param execution - the current tool execution.
   * @returns an immutable environment overlay containing built-ins and current contributions.
   */
  collect(execution: ToolExecution): GnkEnvironment {
    const values: Record<GnkEnvironmentKey, string> = {
      [GNK_HOME_ENV]: this.gnkHome,
      [GNK_SHELL_KEY]: '1',
    }
    if (execution.agent !== undefined) {
      values[GNK_SESSION_ID_KEY] = execution.agent.session.header.id
    }

    for (const contributor of [...this.contributors.values()].sort((left, right) => left.name.localeCompare(right.name))) {
      const resolved = contributor.resolve(execution)
      for (const [rawKey, value] of Object.entries(resolved)) {
        const key = rawKey as GnkEnvironmentKey
        if (!Object.hasOwn(contributor.variables, key)) {
          throw new Error(`bash env contributor "${contributor.name}" returned undeclared key "${key}"`)
        }
        if (typeof value !== 'string') {
          throw new Error(`bash env contributor "${contributor.name}" returned a non-string value for "${key}"`)
        }
        values[key] = value
      }
    }

    return Object.freeze(Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right))))
  }

  // TODO(bash-env-list-builtins): Include registry-owned built-ins before diagnostics,
  // prompt, or UI code treats list() as an exhaustive environment catalog.
  /**
   * Enumerate plugin-contributed variables without executing their resolvers.
   * @returns declarations sorted by environment variable name.
   */
  list(): BashEnvVariableInfo[] {
    return [...this.contributors.values()]
      .flatMap(contributor => Object.entries(contributor.variables).map(([key, variable]) => ({
        contributor: contributor.name,
        description: variable.description,
        key: key as GnkEnvironmentKey,
      })))
      .sort((left, right) => left.key.localeCompare(right.key))
  }
}

/**
 * Load the shell-env plugin: register the `ctx.shellEnv` registry service.
 * @param ctx - Cordis context that owns the service and registrations.
 * @param config - home-directory configuration for the built-in variables.
 */
export function apply(ctx: Context, config: Config = {}): void {
  new ShellEnvRegistry(ctx, config)
}

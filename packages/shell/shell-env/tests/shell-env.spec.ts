/**
 * Registry tests for `@greeneek/gnk-shell-env`: built-in facts, contributor
 * ownership and validation, collection ordering, effect-scoped disposal, and
 * the explicit disposer contract.
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@greeneek/cordis'
import { ToolCallId } from '@greeneek/gnk-llm'
import type { Agent } from '@greeneek/gnk-agent'
import type { ToolExecution } from '@greeneek/gnk-tools'
import { ShellEnvRegistry } from '@greeneek/gnk-shell-env'
import * as BashEnvPlugin from '@greeneek/gnk-shell-env'

const testToolSignal = new AbortController().signal

afterEach(() => vi.unstubAllEnvs())

function execution(sessionId?: string): ToolExecution {
  return {
    signal: testToolSignal,
    token: Symbol('bash-env-test') as ToolExecution['token'],
    callId: ToolCallId('bash-env-call'),
    rootCallId: ToolCallId('bash-env-call'),
    name: 'bash',
    arguments: { command: 'true' },
    ...(sessionId === undefined
      ? {}
      : { agent: { session: { header: { version: 0, id: sessionId, createdAt: 0 } } } as Agent }),
  }
}

describe('ShellEnvRegistry', () => {
  it('collects unconditional shell facts and the current agent session id', () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { gnkHome: './test-gnk-home' })

    expect(registry.collect(execution())).toEqual({
      GNK_HOME: resolve('./test-gnk-home'),
      GNK_SHELL: '1',
    })
    expect(registry.collect(execution('session-a'))).toEqual({
      GNK_HOME: resolve('./test-gnk-home'),
      GNK_SESSION_ID: 'session-a',
      GNK_SHELL: '1',
    })
  })

  it('resolves GNK_HOME from the ambient override or the user-home default', () => {
    vi.stubEnv('GNK_HOME', './ambient-gnk-home')
    const fromEnvironment = new ShellEnvRegistry(new Context())
    expect(fromEnvironment.collect(execution()).GNK_HOME).toBe(resolve('./ambient-gnk-home'))

    vi.stubEnv('GNK_HOME', undefined)
    const fromDefault = new ShellEnvRegistry(new Context())
    expect(fromDefault.collect(execution()).GNK_HOME).toBe(join(homedir(), '.gnk'))
  })

  it('collects declared contributor variables and omits unavailable values', () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { gnkHome: './test-gnk-home' })
    registry.register({
      name: 'optional-session-fact',
      variables: {
        GNK_SESSION_OPTIONAL: { description: 'Optional session-scoped test fact.' },
      },
      resolve: exec => exec.agent === undefined ? {} : { GNK_SESSION_OPTIONAL: exec.agent.session.header.id },
    })
    registry.register({
      name: 'always-available-fact',
      variables: {
        GNK_ALWAYS_AVAILABLE: { description: 'Always-available test fact.' },
      },
      resolve: () => ({ GNK_ALWAYS_AVAILABLE: 'yes' }),
    })

    expect(registry.collect(execution())).not.toHaveProperty('GNK_SESSION_OPTIONAL')
    expect(registry.collect(execution()).GNK_ALWAYS_AVAILABLE).toBe('yes')
    expect(registry.collect(execution('session-b')).GNK_SESSION_OPTIONAL).toBe('session-b')
    expect(registry.list()).toEqual([
      {
        contributor: 'always-available-fact',
        description: 'Always-available test fact.',
        key: 'GNK_ALWAYS_AVAILABLE',
      },
      {
        contributor: 'optional-session-fact',
        description: 'Optional session-scoped test fact.',
        key: 'GNK_SESSION_OPTIONAL',
      },
    ])
  })

  it('rejects duplicate variable ownership at registration time', () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { gnkHome: './test-gnk-home' })
    registry.register({
      name: 'first',
      variables: { GNK_SHARED: { description: 'First owner.' } },
      resolve: () => ({ GNK_SHARED: 'first' }),
    })

    expect(() => registry.register({
      name: 'second',
      variables: { GNK_SHARED: { description: 'Second owner.' } },
      resolve: () => ({ GNK_SHARED: 'second' }),
    })).toThrow(/GNK_SHARED.*first.*second|GNK_SHARED.*second.*first/)
  })

  it('rejects duplicate contributor names and malformed declarations', () => {
    const registry = new ShellEnvRegistry(new Context(), { gnkHome: './test-gnk-home' })
    registry.register({
      name: 'declared',
      variables: { GNK_DECLARED: { description: 'Declared fact.' } },
      resolve: () => ({}),
    })

    expect(() => registry.register({
      name: 'declared',
      variables: { GNK_ANOTHER: { description: 'Another fact.' } },
      resolve: () => ({}),
    })).toThrow(/already registered/)
    expect(() => registry.register({
      name: ' ',
      variables: { GNK_BLANK_NAME: { description: 'Blank owner.' } },
      resolve: () => ({}),
    })).toThrow(/name must be non-empty/)
    expect(() => registry.register({
      name: 'invalid-key',
      variables: { gnk_invalid: { description: 'Invalid key.' } } as unknown as Record<'GNK_INVALID', { description: string }>,
      resolve: () => ({}),
    })).toThrow(/invalid key/)
    expect(() => registry.register({
      name: 'reserved-key',
      variables: { GNK_HOME: { description: 'Reserved key.' } },
      resolve: () => ({}),
    })).toThrow(/reserved key/)
    expect(() => registry.register({
      name: 'blank-description',
      variables: { GNK_BLANK_DESCRIPTION: { description: ' ' } },
      resolve: () => ({}),
    })).toThrow(/must describe/)
  })

  it('rejects undeclared variables returned by a contributor', () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { gnkHome: './test-gnk-home' })
    registry.register({
      name: 'drifted-provider',
      variables: { GNK_DECLARED: { description: 'Declared fact.' } },
      resolve: () => ({ GNK_UNDECLARED: 'bad' }),
    })

    expect(() => registry.collect(execution())).toThrow(/drifted-provider.*GNK_UNDECLARED/)
  })

  it('rejects non-string values returned by a contributor', () => {
    const registry = new ShellEnvRegistry(new Context(), { gnkHome: './test-gnk-home' })
    registry.register({
      name: 'wrong-value-type',
      variables: { GNK_STRING: { description: 'String fact.' } },
      resolve: () => ({ GNK_STRING: 42 }) as unknown as Record<'GNK_STRING', string>,
    })

    expect(() => registry.collect(execution())).toThrow(/wrong-value-type.*non-string.*GNK_STRING/)
  })

  it('removes an effect-scoped contributor when its plugin is disposed', async () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { gnkHome: './test-gnk-home' })
    const fiber = await ctx.plugin({
      inject: ['shellEnv'],
      apply(inner: Context) {
        inner.shellEnv.register({
          name: 'temporary',
          variables: { GNK_TEMPORARY: { description: 'Temporary fact.' } },
          resolve: () => ({ GNK_TEMPORARY: 'present' }),
        })
      },
    })

    expect(registry.collect(execution()).GNK_TEMPORARY).toBe('present')
    await fiber.dispose()
    expect(registry.collect(execution())).not.toHaveProperty('GNK_TEMPORARY')
  })

  it('returns an explicit contributor disposer', () => {
    const registry = new ShellEnvRegistry(new Context(), { gnkHome: './test-gnk-home' })
    const dispose = registry.register({
      name: 'explicit-disposal',
      variables: { GNK_EXPLICIT_DISPOSAL: { description: 'Explicitly disposed fact.' } },
      resolve: () => ({ GNK_EXPLICIT_DISPOSAL: 'present' }),
    })

    expect(registry.collect(execution()).GNK_EXPLICIT_DISPOSAL).toBe('present')
    dispose()
    expect(registry.collect(execution())).not.toHaveProperty('GNK_EXPLICIT_DISPOSAL')
  })

  it('the plugin registers the service with no contributors on load', async () => {
    const ctx = new Context()
    await ctx.plugin(BashEnvPlugin)
    expect(ctx.shellEnv).toBeInstanceOf(ShellEnvRegistry)
    expect(ctx.shellEnv.list()).toEqual([])
  })
})

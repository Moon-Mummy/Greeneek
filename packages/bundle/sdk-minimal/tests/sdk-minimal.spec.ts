/** The standalone SDK-minimal bundle's complete declared Cordis tree. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { entryListSchema } from '@greeneek/cordis-plugin-include'

function packageName(specifier: string): string {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!
}

describe('gnk-sdk-minimal bundle', () => {
  it('declares one standalone allowlisted tree with every row dependency', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      gnk?: { bundle?: { patch?: string } }
    }
    expect(manifest.gnk?.bundle?.patch).toBe('./cordis.patch.yml')
    const patches = yaml.load(
      readFileSync(resolve(root, manifest.gnk!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as Array<{ insert?: Array<{ id?: string; inject?: string[]; name?: string; config?: Record<string, unknown>; disabled?: unknown }> }>
    expect(patches).toHaveLength(1)
    const rows = patches[0]?.insert ?? []
    expect(rows.map(row => [row.id, row.name])).toEqual([
      ['sdk-app-startup', '@greeneek/gnk-sdk-app'],
      ['sdk-jsonrpc-server', '@greeneek/gnk-sdk-jsonrpc-server'],
      ['greeneek-llm-api-extensions', '@greeneek/gnk-greeneek-llm-api-extensions'],
      ['llm-pi-ai', '@greeneek/gnk-llm-pi-ai'],
      ['sandbox', '@greeneek/gnk-sandbox-local'],
      ['session-projection', '@greeneek/gnk-session-projection'],
      ['sandbox-policy', '@greeneek/gnk-sandbox-policy'],
      ['subprocess', '@greeneek/gnk-subprocess-local'],
      ['pty', '@greeneek/gnk-terminal'],
      ['terminal-bash', '@greeneek/gnk-terminal-bash'],
      ['terminal-pwsh', '@greeneek/gnk-terminal-bash'],
      ['fs-local', '@greeneek/gnk-fs-local'],
      ['timer', '@greeneek/cordis-plugin-timer'],
      ['llm', '@greeneek/gnk-llm'],
      ['session', '@greeneek/gnk-session'],
      ['session-title', '@greeneek/gnk-session-title'],
      ['system-prompt', '@greeneek/gnk-system-prompt'],
      ['tools', '@greeneek/gnk-tools'],
      ['agent', '@greeneek/gnk-agent'],
      ['llm-retry', '@greeneek/gnk-llm-retry'],
      ['jobs', '@greeneek/gnk-jobs-local'],
      ['invariants', '@greeneek/gnk-invariants'],
      ['session-invariant', '@greeneek/gnk-session/invariant'],
      ['agent-invariant', '@greeneek/gnk-agent/invariant'],
      ['scope-invariant', '@greeneek/gnk-scope/invariant'],
      ['agent-loop-invariant', '@greeneek/gnk-agent-loop/invariant'],
      ['agent-loop', '@greeneek/gnk-agent-loop'],
      ['persistent-bash', '@greeneek/gnk-tool-bash-persistent'],
      ['persistent-pwsh', '@greeneek/gnk-tool-pwsh-persistent'],
      ['str-replace-editor', '@greeneek/gnk-tool-str-replace-editor'],
      ['sessions', '@greeneek/gnk-session-persistence-jsonl'],
    ])
    expect(rows.find(row => row.id === 'sdk-app-startup')?.config).toEqual({ profile: 'sdk-minimal' })
    expect(rows.find(row => row.id === 'sdk-jsonrpc-server')).toMatchObject({
      inject: ['sdkAppStartup', 'loader'],
      config: { maxTokensAsSuccess: false },
    })
    // Every route this standalone profile serves is one the caller's own key
    // activates; a route whose variable is unset simply refuses its first
    // request rather than sitting in the picker unable to answer.
    expect(rows.find(row => row.id === 'llm-pi-ai')?.config).toEqual({
      providers: {
        openai: {
          apiKeyEnv: 'OPENAI_API_KEY',
          streamIdleTimeoutMs: 172800000,
          defaultContextWindow: { __jsExpr: 'Number(process.env.GNK_CONTEXT_WINDOW ?? 1000000)' },
        },
        anthropic: {
          apiKeyEnv: 'ANTHROPIC_API_KEY',
          streamIdleTimeoutMs: 172800000,
          defaultContextWindow: { __jsExpr: 'Number(process.env.GNK_CONTEXT_WINDOW ?? 1000000)' },
        },
        google: {
          apiKeyEnv: 'GEMINI_API_KEY',
          streamIdleTimeoutMs: 172800000,
          defaultContextWindow: { __jsExpr: 'Number(process.env.GNK_CONTEXT_WINDOW ?? 1000000)' },
        },
      },
    })
    expect(rows.find(row => row.id === 'system-prompt')?.config).toEqual({
      includeHarnessIdentity: false,
      includeRuntimeContext: false,
      persona: { __jsExpr: "process.env.GNK_SYSTEM_PROMPT ?? 'You are a helpful software engineer assistant.'" },
    })
    expect(rows.find(row => row.id === 'agent-loop')?.config).toEqual({ agents: [] })
    expect(rows.find(row => row.id === 'terminal-bash')).toMatchObject({
      disabled: { __jsExpr: "process.platform === 'win32'" },
    })
    expect(rows.find(row => row.id === 'terminal-pwsh')).toMatchObject({
      disabled: { __jsExpr: "process.platform !== 'win32'" },
      config: { shellDialect: 'pwsh', timeoutMs: 300000 },
    })
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(
      [...new Set(rows.map(row => row.name).filter((name): name is string => name !== undefined).map(packageName))].sort(),
    )
  })
})

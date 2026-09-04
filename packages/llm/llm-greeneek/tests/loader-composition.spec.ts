/**
 * Real-composition guard for the dynamic-configuration chain: LlmRuntime,
 * settings-file, credentials-local, and llm-greeneek boot from a test-only
 * cordis.yml through the actual Loader + Include path, external edits of
 * settings.yaml and the credentials document hot-publish through their providers, and the very
 * next request carries the fresh base URL and credential. The same adapter
 * composition without settings or credentials entries keeps entry-config
 * behavior — the documented optional-inject fallback.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@greeneek/cordis'
import Loader from '@greeneek/cordis-plugin-loader'
import Include from '@greeneek/cordis-plugin-include'
import LlmRuntime from '@greeneek/gnk-llm'
import AgentRegistry from '@greeneek/gnk-agent'
import SessionStore, { SessionId } from '@greeneek/gnk-session'
import { credentialRef } from '@greeneek/gnk-credentials'
import LocalCredentialProvider from '@greeneek/gnk-credentials-local'
import FileSettingsProvider from '@greeneek/gnk-settings-file'
import { getOrCreateAnonymousUserId } from '@greeneek/gnk-anonymous-user-id'
import GreeneekLlmApiExtensionRegistry from '@greeneek/gnk-greeneek-llm-api-extensions'
import * as SessionLogGreeneek from '@greeneek/gnk-session-log-greeneek'
import * as GreeneekPluginPackageInventory from '@greeneek/gnk-plugin-package-inventory-greeneek'
import * as LlmGreeneek from '@greeneek/gnk-llm-greeneek'
import { assemble } from './assemble.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'

const NS = 'llm-greeneek'
const KEY_REF = credentialRef('GREENEEK_API_KEY')

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  await closeMockServers()
  vi.unstubAllEnvs()
})

async function loadComposition(
  options: { withDynamic: boolean; baseURL: string; reuseRoot?: string; enableSessionLog?: boolean },
): Promise<{ ctx: Context; settingsPath: string; credentialsPath: string }> {
  // A reused root is the restart case: the same harness home, its documents
  // exactly as the previous process left them.
  const fresh = options.reuseRoot === undefined
  root = options.reuseRoot ?? await mkdtemp(join(tmpdir(), 'gnk-llm-composition-'))
  vi.stubEnv('GNK_HOME', root)
  const settingsPath = join(root, 'settings.yaml')
  const credentialsPath = join(root, '.credentials.yaml')
  if (options.withDynamic && fresh) {
    await writeFile(settingsPath, '# personal settings\n')
    await writeFile(credentialsPath, 'version: 1\nrefs:\n  GREENEEK_API_KEY: boot-key\n', { mode: 0o600 })
  }

  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- id: llm',
    "  name: '@greeneek/gnk-llm'",
    '- id: session',
    "  name: '@greeneek/gnk-session'",
    '- id: agents',
    "  name: '@greeneek/gnk-agent'",
    '- id: greeneek-llm-api-extensions',
    "  name: '@greeneek/gnk-greeneek-llm-api-extensions'",
    '- id: session-log-greeneek',
    "  name: '@greeneek/gnk-session-log-greeneek'",
    ...options.enableSessionLog === true
      ? ['  config:', '    enabled: true']
      : [],
    '- id: plugin-package-inventory-greeneek',
    "  name: '@greeneek/gnk-plugin-package-inventory-greeneek'",
    ...options.withDynamic
      ? [
        '- id: settings',
        "  name: '@greeneek/gnk-settings-file'",
        '  config:',
        `    path: ${JSON.stringify(settingsPath)}`,
        '    debounceMs: 10',
        '- id: credentials',
        "  name: '@greeneek/gnk-credentials-local'",
        '  config:',
        `    path: ${JSON.stringify(credentialsPath)}`,
        '    debounceMs: 10',
      ]
      : [],
    '- id: llm-greeneek',
    "  name: '@greeneek/gnk-llm-greeneek'",
    '  config:',
    `    baseURL: ${JSON.stringify(options.baseURL)}`,
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@greeneek/gnk-llm', LlmRuntime],
    ['@greeneek/gnk-session', SessionStore],
    ['@greeneek/gnk-agent', AgentRegistry],
    ['@greeneek/gnk-greeneek-llm-api-extensions', GreeneekLlmApiExtensionRegistry],
    ['@greeneek/gnk-session-log-greeneek', SessionLogGreeneek],
    ['@greeneek/gnk-plugin-package-inventory-greeneek', GreeneekPluginPackageInventory],
    ['@greeneek/gnk-settings-file', FileSettingsProvider],
    ['@greeneek/gnk-credentials-local', LocalCredentialProvider],
    ['@greeneek/gnk-llm-greeneek', LlmGreeneek],
  ])
  // The custom importer bypasses Node resolution; mirror the package manifests
  // a deployed cordis.yml has beside its declared dependencies.
  await Promise.all([...modules.keys()].map(async (packageName) => {
    const packageDir = join(root!, 'node_modules', ...packageName.split('/'))
    await mkdir(packageDir, { recursive: true })
    await writeFile(join(packageDir, 'package.json'), `${JSON.stringify({
      name: packageName,
      version: '0.1.0-rc.8',
      type: 'module',
    })}\n`)
  }))
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return { ctx, settingsPath, credentialsPath }
}

describe('llm-greeneek real dynamic composition', () => {
  it('keeps session upload off and package inventory on by default in the real Loader composition', async () => {
    vi.stubEnv('GREENEEK_API_KEY', 'entry-key')
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx } = await loadComposition({ withDynamic: false, baseURL: server.url })
    const session = ctx.sessions.create(SessionId('extension-composition'))
    session.append('turn/start', { turn: 1 })

    await assemble(ctx, { model: 'greeneek-v4-flash', messages: [], sessionId: session.id })
    const request = server.requests[0] as { gnk_plugin_packages: { version: number; packages: unknown[] } }
    expect(request).not.toHaveProperty('gnk_session_log')
    expect(request.gnk_plugin_packages.packages).toEqual(expect.arrayContaining([
      { name: '@greeneek/gnk-greeneek-llm-api-extensions', version: '0.1.0-rc.8' },
      { name: '@greeneek/gnk-llm-greeneek', version: '0.1.0-rc.8' },
      { name: '@greeneek/gnk-session-log-greeneek', version: '0.1.0-rc.8' },
    ]))
    expect(request.gnk_plugin_packages.version).toBe(1)
    expect(SessionLogGreeneek.acceptedThrough(session)).toBe(-1)
  })

  it('sends the canonical session suffix when the Loader composition explicitly enables upload', async () => {
    vi.stubEnv('GREENEEK_API_KEY', 'entry-key')
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx } = await loadComposition({
      withDynamic: false,
      baseURL: server.url,
      enableSessionLog: true,
    })
    const session = ctx.sessions.create(SessionId('extension-composition-enabled'))
    session.append('turn/start', { turn: 1 })

    await assemble(ctx, { model: 'greeneek-v4-flash', messages: [], sessionId: session.id })
    const request = server.requests[0] as {
      gnk_session_log?: {
        version: number
        session: { id: string }
        afterSeq: number
        throughSeq: number
        events: Array<{ type: string; seq: number }>
      }
    }
    expect(request.gnk_session_log).toMatchObject({
      version: 1,
      session: { id: 'extension-composition-enabled' },
      afterSeq: -1,
      throughSeq: 0,
      events: [{ type: 'turn/start', seq: 0 }],
    })
    expect(SessionLogGreeneek.acceptedThrough(session)).toBe(0)
  })

  it('boots from cordis.yml and routes the next request after external settings and credential edits', async () => {
    vi.stubEnv('GREENEEK_API_KEY', '')
    const serverA = await mockServer([{ kind: 'sse', events: textEvents }])
    const serverB = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx, settingsPath, credentialsPath } = await loadComposition({ withDynamic: true, baseURL: serverA.url })

    expect(ctx.get('settings')!.describe().map(entry => entry.ns)).toEqual([NS])
    await assemble(ctx, { model: 'greeneek-v4-flash', messages: [] })
    expect(serverA.headers[0]?.authorization).toBe('Bearer boot-key')
    expect(serverA.headers[0]?.['x-greeneek-harness-user-id']).toBe(getOrCreateAnonymousUserId())

    // External edits, exactly as a user or the web UI would leave them on disk.
    await writeFile(settingsPath, `llm-greeneek:\n  baseURL: ${serverB.url}\n`)
    await vi.waitFor(() => {
      expect((ctx.get('settings')!.get(NS) as { baseURL?: string }).baseURL).toBe(serverB.url)
    }, { timeout: 5000 })
    await writeFile(credentialsPath, 'version: 1\nrefs:\n  GREENEEK_API_KEY: rotated-key\n', { mode: 0o600 })
    await vi.waitFor(async () => {
      expect(await ctx.get('credentials')!.resolve(KEY_REF)).toEqual({ value: 'rotated-key', source: 'file' })
    }, { timeout: 5000 })

    await assemble(ctx, { model: 'greeneek-v4-flash', messages: [] })
    expect(serverA.requests).toHaveLength(1)
    expect(serverB.headers[0]?.authorization).toBe('Bearer rotated-key')
  })

  it('keeps a stored key writable and rotatable across a real restart', async () => {
    // No ambient GREENEEK_API_KEY: the shipped surfaces do not hoist
    // the credentials document into process.env, so a stored key must stay file-sourced.
    vi.stubEnv('GREENEEK_API_KEY', '')
    const first = await mockServer([{ kind: 'sse', events: textEvents }])
    const second = await mockServer([{ kind: 'sse', events: textEvents }])
    const boot = await loadComposition({ withDynamic: true, baseURL: first.url })
    const home = root!
    await boot.ctx.get('credentials')!.set(KEY_REF, 'stored-by-ui')
    expect(await boot.ctx.get('credentials')!.describe(KEY_REF))
      .toEqual({ configured: true, source: 'file', writable: true })
    await assemble(boot.ctx, { model: 'greeneek-v4-flash', messages: [] })
    expect(first.headers[0]?.authorization).toBe('Bearer stored-by-ui')
    await boot.ctx.fiber.dispose()
    context = undefined

    // Restart over the same harness home.
    const restarted = await loadComposition({ withDynamic: true, baseURL: second.url, reuseRoot: home })
    const credentials = restarted.ctx.get('credentials')!
    // The stored key is still the provider's own writable file entry — not a
    // read-only launch override, which is what hoisting it would have made it.
    expect(await credentials.resolve(KEY_REF)).toEqual({ value: 'stored-by-ui', source: 'file' })
    expect(await credentials.describe(KEY_REF)).toEqual({ configured: true, source: 'file', writable: true })
    // Rotation still works after the restart, and the next request uses it.
    await credentials.set(KEY_REF, 'rotated-after-restart')
    await assemble(restarted.ctx, { model: 'greeneek-v4-flash', messages: [] })
    expect(second.headers[0]?.authorization).toBe('Bearer rotated-after-restart')
  })

  it('boots the same adapter on entry config alone, resolving the reference from the environment', async () => {
    // No settings and no credentials provider: configuration carries only the
    // reference, so the environment is the whole credential plane here.
    vi.stubEnv('GREENEEK_API_KEY', 'entry-key')
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx } = await loadComposition({ withDynamic: false, baseURL: server.url })

    expect(ctx.get('settings')).toBeUndefined()
    expect(ctx.get('credentials')).toBeUndefined()
    await assemble(ctx, { model: 'greeneek-v4-flash', messages: [] })
    expect(server.headers[0]?.authorization).toBe('Bearer entry-key')
  })
})

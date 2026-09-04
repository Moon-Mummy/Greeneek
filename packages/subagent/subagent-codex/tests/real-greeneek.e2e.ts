import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { Context } from '@greeneek/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '@greeneek/gnk-agent'
import SubagentRuntime from '@greeneek/gnk-subagent'
import SessionProjectionRegistry from '@greeneek/gnk-session-projection'
import type { SubprocessHandle } from '@greeneek/gnk-subprocess'
import LocalSubprocessRuntime from '@greeneek/gnk-subprocess-local'
import * as codex from '../src/index.ts'
import {
  startGreeneekResponsesBridge,
  type GreeneekResponsesBridge,
} from './greeneek-responses-bridge.ts'

const execFileAsync = promisify(execFile)
const codexPackageJson = createRequire(import.meta.url).resolve('@openai/codex/package.json')
const codexPackage = JSON.parse(readFileSync(
  codexPackageJson,
  'utf8',
)) as { version: string; bin: { codex: string } }
const codexEntry = resolve(dirname(codexPackageJson), codexPackage.bin.codex)

const roots: string[] = []
const contexts: Context[] = []
const bridges: GreeneekResponsesBridge[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(bridges.splice(0).map(bridge => bridge.close()))
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function expectQuiescent(handles: readonly SubprocessHandle[]): Promise<void> {
  expect(handles.length).toBeGreaterThan(0)
  for (const handle of handles) {
    await expect(handle.waitForExit()).resolves.toBe(true)
    await expect(handle.done).resolves.toHaveProperty('exitCode')
  }
}

describe.skipIf(!process.env.GREENEEK_API_KEY)(
  'Codex provider with real Greeneek API',
  () => {
    it('returns one unique nonce through the production provider and real Codex', async () => {
      const apiKey = process.env.GREENEEK_API_KEY
      if (apiKey === undefined) throw new Error('e2e ran without GREENEEK_API_KEY')
      const root = mkdtempSync(join(tmpdir(), 'gnk-codex-greeneek-e2e-'))
      roots.push(root)
      const workspace = join(root, 'workspace')
      const codexHome = join(root, 'codex-home')
      mkdirSync(workspace)
      mkdirSync(codexHome)
      const nonce = `GNK_CODEX_GREENEEK_${randomUUID()}`
      const bridge = await startGreeneekResponsesBridge(nonce)
      bridges.push(bridge)
      writeFileSync(join(codexHome, 'config.toml'), [
        'model = "greeneek-v4-flash"',
        'model_provider = "greeneek-e2e"',
        'approval_policy = "never"',
        'sandbox_mode = "read-only"',
        'disable_response_storage = true',
        'check_for_update_on_startup = false',
        '',
        '[model_providers.greeneek-e2e]',
        'name = "Greeneek E2E bridge"',
        `base_url = "${bridge.baseUrl}"`,
        'env_key = "GREENEEK_API_KEY"',
        'wire_api = "responses"',
        'requires_openai_auth = false',
        '',
        '[analytics]',
        'enabled = false',
        '',
      ].join('\n'))
      const env = {
        GREENEEK_API_KEY: apiKey,
        CODEX_HOME: codexHome,
        HOME: root,
        XDG_CONFIG_HOME: join(root, 'xdg-config'),
        PATH: root,
        HTTP_PROXY: '',
        HTTPS_PROXY: '',
        ALL_PROXY: '',
        NO_PROXY: '127.0.0.1,localhost',
      }
      const ctx = new Context()
      contexts.push(ctx)
      await ctx.plugin(SessionProjectionRegistry)
      await ctx.plugin(SubagentRuntime)
      await ctx.plugin(LocalSubprocessRuntime)
      const handles: SubprocessHandle[] = []
      const spawn = ctx.subprocess.spawn.bind(ctx.subprocess)
      vi.spyOn(ctx.subprocess, 'spawn').mockImplementation((spec) => {
        const handle = spawn(spec)
        handles.push(handle)
        return handle
      })
      await ctx.plugin(codex, { env, disposeGraceMs: 2_000 })
      const version = await execFileAsync(process.execPath, [codexEntry, '--version'], {
        env: { ...process.env, ...env },
      })
      expect(codexPackage.version).toBe('0.149.1')
      expect(version.stdout.trim()).toBe('codex-cli 0.149.1')

      const parent = {
        id: 'greeneek-e2e-parent',
        session: { header: { cwd: workspace } },
      } as unknown as Agent
      const run = await ctx.subagents.start('codex', {
        prompt: [{
          type: 'text',
          text: `Reply with exactly ${nonce} and nothing else. Do not use tools.`,
        }],
        parent,
        signal: new AbortController().signal,
      })
      const result = await run.result
      await run.dispose()

      expect(result.stopReason).toBe('completed')
      const text = result.output
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('')
        .trim()
      expect(text).toBe(nonce)
      expect(bridge.completedRequests).toBe(1)
      await expectQuiescent(handles)
    }, 180_000)
  },
)

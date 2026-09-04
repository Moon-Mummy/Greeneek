import { createUserMessage } from '@greeneek/gnk-llm'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@greeneek/cordis'
import LlmRuntime from '@greeneek/gnk-llm'
import * as LlmGreeneek from '@greeneek/gnk-llm-greeneek'
import SessionStore, { SessionId } from '@greeneek/gnk-session'
import SessionTitleService from '@greeneek/gnk-session-title'
import SessionProjectionRegistry from '@greeneek/gnk-session-projection'
import * as FirstMessageTitleProvider from '@greeneek/gnk-session-title-first-prompt-llm'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe.skipIf(!process.env.GREENEEK_API_KEY)('first-prompt title provider with real Greeneek API', () => {
  it('replaces the fallback with a short model title', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmGreeneek, { thinking: 'disabled' })
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionTitleService, {
      fallbackMaxWords: 5,
      fallbackMaxBytes: 40,
      maxTitleBytes: 80,
    })
    await ctx.plugin(FirstMessageTitleProvider, {
      targetWords: 5,
      targetCjkCharacters: 10,
      maxInputBytes: 4_096,
      maxOutputTokens: 64,
      timeoutMs: 60_000,
      provider: 'greeneek-official',
      model: 'greeneek-v4-flash',
    })
    const session = ctx.sessions.create(SessionId('real-title-provider'))
    session.append('turn/start', {
      turn: 1,
    })
    const message = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'Explain why append-only logs make session titles durable.' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })

    const title = await ctx.sessionTitle.refresh(session)

    expect(title).toMatchObject({
      messageSeqs: [message.seq],
      source: {
        kind: 'provider',
        provider: 'session-title-first-prompt-llm',
        model: { provider: 'greeneek-official', model: 'greeneek-v4-flash' },
      },
    })
    expect(title?.title.length).toBeGreaterThan(0)
    expect(Buffer.byteLength(title?.title ?? '', 'utf8')).toBeLessThanOrEqual(80)
  })
})

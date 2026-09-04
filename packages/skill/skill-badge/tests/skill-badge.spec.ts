import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Context } from '@greeneek/cordis'
import { describe, expect, it } from 'vitest'
import SkillRegistry from '@greeneek/gnk-skill'
import * as SkillBadge from '@greeneek/gnk-skill-badge'

describe('gnk-skill-badge', () => {
  it('registers and disposes the bundled badge skill', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillBadge)
    const resourcePath = fileURLToPath(new URL('../assets/', import.meta.url))

    expect(await ctx.skills.list()).toEqual([{
      name: 'gnk-badge',
      description: 'Add the official “powered by gnk” badge to documents, pull requests, merge requests, and other content produced with Greeneek Harness. Use whenever creating a pull request or merge request. Also use when the user asks for a gnk badge, powered-by-gnk attribution, or a reusable gnk badge asset or snippet.',
      invocation: { modelInvocable: true, userInvocable: true },
      provider: 'gnk-badge',
      source: 'bundled',
      resourceBase: { kind: 'directory', path: resourcePath },
    }])
    const loaded = await ctx.skills.get('gnk-badge')
    expect(loaded?.content).toContain('Preserve the badge\'s 121×20 dimensions')
    expect(loaded?.resourceBase).toEqual({ kind: 'directory', path: resourcePath })

    await fiber.dispose()
    expect(await ctx.skills.list()).toEqual([])
  })

  it('ships the official 726×120 PNG unchanged', async () => {
    const image = await readFile(new URL('../assets/gnk-badge.png', import.meta.url))
    expect(image.readUInt32BE(16)).toBe(726)
    expect(image.readUInt32BE(20)).toBe(120)
    expect(createHash('sha256').update(image).digest('hex')).toBe(
      '0bc17004e102a6b9a9e37accde8b344e7fc65f9f96e2d751387848c01c2d9e6f',
    )
  })
})

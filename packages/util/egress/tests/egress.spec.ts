/**
 * Unit coverage for the egress policy: the retired-provider blocklist is
 * absolute, strict allow-listing is opt-in, and every failure surfaces as
 * `EgressBlockedError` with the hostname attached.
 * @module
 */

import { describe, expect, it } from 'vitest'
import { BLOCKED_HOSTS, EgressBlockedError, STRICT_ALLOWED_HOSTS, assertEgressAllowed } from '../src/index.ts'

describe('assertEgressAllowed', () => {
  it('accepts the Greeneek gateway and unrelated hosts by default', () => {
    expect(() => assertEgressAllowed('https://api.greeneek.dev/v1/chat/completions', {})).not.toThrow()
    expect(() => assertEgressAllowed('https://example.org/anything', {})).not.toThrow()
  })

  it.each([
    'https://api.deepseek.com/chat/completions',
    'https://api.deepseek.com',
    'http://deepseek.com',
    'https://platform.deepseek.com/keys',
    'https://chat.deepseek.com/anything',
    'https://www.deepseek.com',
    'https://sub.api.deepseek.cn/v1',
    'https://api.deepseek.ai/anything',
  ])('refuses every retired-provider endpoint: %s', url => {
    expect(() => assertEgressAllowed(url, {})).toThrow(EgressBlockedError)
    expect(() => assertEgressAllowed(url, {})).toThrow(/never contacted/)
  })

  it('refuses blocked hosts even under strict-mode allow-listing', () => {
    // The allow-list never applies to a blocked host: ordering is absolute.
    expect(() => assertEgressAllowed('https://api.deepseek.com/v1', { GNK_STRICT_EGRESS: '1' }))
      .toThrow(/never contacted/)
    expect(() => assertEgressAllowed('https://api.greeneek.dev/v1', { GNK_STRICT_EGRESS: '1' })).not.toThrow()
    expect(() => assertEgressAllowed('https://example.org', { GNK_STRICT_EGRESS: '1' })).toThrow(/allows only/)
  })

  it('wraps unparseable endpoints into the one error class', () => {
    expect(() => assertEgressAllowed('not a url', {})).toThrow(EgressBlockedError)
    expect(() => assertEgressAllowed('not a url', {})).toThrow(/not an absolute URL/)
  })

  it('attaches the refused hostname', () => {
    try {
      assertEgressAllowed('https://API.DeepSeek.com/v1', {})
      expect.unreachable('blocked host must not pass')
    } catch (error) {
      expect(error).toBeInstanceOf(EgressBlockedError)
      expect((error as EgressBlockedError).hostname).toBe('api.deepseek.com')
    }
  })

  it('keeps the blocklist free of Greeneek hosts', () => {
    expect(STRICT_ALLOWED_HOSTS.has('api.greeneek.dev')).toBe(true)
    for (const pattern of BLOCKED_HOSTS) expect(pattern.test('api.greeneek.dev')).toBe(false)
  })
})

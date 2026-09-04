// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DocumentTitle } from '../src/client/DocumentTitle.tsx'

afterEach(() => {
  cleanup()
  document.title = ''
  vi.unstubAllEnvs()
})

describe('DocumentTitle', () => {
  it('projects a durable title and restores the product title', () => {
    vi.stubEnv('GNK_CLIENT_TITLE', 'Greeneek Harness')
    document.title = 'stale title'
    const mounted = render(<DocumentTitle productTitle="Greeneek Harness" />)
    expect(document.title).toBe('Greeneek Harness')
    mounted.rerender(<DocumentTitle title="First title" productTitle="Greeneek Harness" />)
    expect(document.title).toBe('First title — Greeneek Harness')
    mounted.rerender(<DocumentTitle title="Revised title" productTitle="Greeneek Harness" />)
    expect(document.title).toBe('Revised title — Greeneek Harness')
    mounted.rerender(<DocumentTitle productTitle="Greeneek Harness" />)
    expect(document.title).toBe('Greeneek Harness')
    mounted.unmount()
    expect(document.title).toBe('Greeneek Harness')
  })

  it('uses the generic title when the build provides no title', () => {
    vi.stubEnv('GNK_CLIENT_TITLE', '')
    delete process.env.GNK_CLIENT_TITLE
    const mounted = render(<DocumentTitle title="First title" productTitle="GNK Local Build" />)
    expect(document.title).toBe('First title — GNK Local Build')
    mounted.unmount()
    expect(document.title).toBe('GNK Local Build')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPersistedKey, readPersistedKey } from '../src/index.ts'

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
    removeItem: (key: string) => { map.delete(key) },
    key: (index: number) => [...map.keys()][index] ?? null,
    clear: () => map.clear(),
    get length() { return map.size },
  } as Storage
}

const entries = (storage: Storage): Record<string, string> =>
  Object.fromEntries(Array.from({ length: storage.length }, (_, i) => [storage.key(i)!, storage.getItem(storage.key(i)!)!]))

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage())
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('persisted key compatibility (rebrand read-through, ends v1.0)', () => {
  it('resolves a current key from the legacy spelling and publishes it forward', () => {
    const storage = globalThis.localStorage
    storage.setItem('dsh.web-theme', 'dark') // rebrand:keep
    expect(readPersistedKey('gnk.web-theme')).toBe('dark')
    expect(storage.getItem('gnk.web-theme')).toBe('dark')
    // The legacy entry is kept on purpose: an old build must still find it.
    expect(storage.getItem('dsh.web-theme')).toBe('dark') // rebrand:keep
  })

  it('prefers the current entry over the legacy one', () => {
    const storage = globalThis.localStorage
    storage.setItem('dsh.web-theme', 'stale') // rebrand:keep
    storage.setItem('gnk.web-theme', 'fresh')
    expect(readPersistedKey('gnk.web-theme')).toBe('fresh')
  })

  it('does not fall through for keys outside the current prefix', () => {
    const storage = globalThis.localStorage
    storage.setItem('dsh.stray', 'value') // rebrand:keep
    expect(readPersistedKey('other.stray')).toBeNull()
  })

  it('clears both spellings so a cleared value cannot resurrect', () => {
    const storage = globalThis.localStorage
    storage.setItem('dsh.web-locale', 'zh-CN') // rebrand:keep
    storage.setItem('gnk.web-locale', 'zh-CN')
    clearPersistedKey('gnk.web-locale')
    expect(entries(storage)).toEqual({})
    expect(readPersistedKey('gnk.web-locale')).toBeNull()
  })

  it('tolerates missing storage entirely', () => {
    vi.unstubAllGlobals()
    expect(readPersistedKey('gnk.anything')).toBeNull()
    expect(() => clearPersistedKey('gnk.anything')).not.toThrow()
  })
})

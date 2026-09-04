/**
 * The identity, timestamp, link, mutation, and durability-sink guarantees
 * MemoryVfs owes its consumers, asserted directly rather than through the
 * `node:fs` bridge.
 *
 * `gnk-fs-local` builds a version token from `dev:ino:size:mtimeNs:ctimeNs` and
 * refuses a write whose token moved since it read. Two properties carry that:
 * `ino` identifies the entry at a path, and `mtimeMs` moves on every write. The
 * timestamp cases freeze the clock, because these writes are in memory and two
 * revisions routinely land in the same millisecond — a real-clock test passes
 * whether or not the strict increment exists.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryVfs } from '../../src/storage/memory.ts'
import type { VfsBigIntStats, VfsMutation, VfsMutationSink, VfsStats } from '../../src/storage/types.ts'

const identity = (vfs: MemoryVfs, path: string): bigint =>
  (vfs.statSync(path, { bigint: true }) as VfsBigIntStats).ino

const linkCount = (vfs: MemoryVfs, path: string): bigint =>
  (vfs.statSync(path, { bigint: true }) as VfsBigIntStats).nlink

const modified = (vfs: MemoryVfs, path: string): number => (vfs.statSync(path) as VfsStats).mtimeMs

afterEach(() => { vi.restoreAllMocks() })

describe('entry identity', () => {
  it('distinguishes paths and holds each identity across repeated stats', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/gnk/one.txt', 'one')
    vfs.seed('/gnk/two.txt', 'two')
    const first = identity(vfs, '/gnk/one.txt')
    expect(identity(vfs, '/gnk/two.txt')).not.toBe(first)
    expect(identity(vfs, '/gnk/one.txt')).toBe(first)
  })

  it('forgets the identities under a directory removed as a subtree', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/gnk/skills/git/SKILL.md', '# git\n')
    const before = identity(vfs, '/gnk/skills/git/SKILL.md')
    vfs.rmSync('/gnk/skills', { recursive: true })
    vfs.seed('/gnk/skills/git/SKILL.md', '# git rebuilt\n')
    expect(identity(vfs, '/gnk/skills/git/SKILL.md')).not.toBe(before)
  })

  it('moves the source identity when a file replaces another path', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/gnk/from.txt', 'moved')
    vfs.seed('/gnk/to.txt', 'replaced')
    const [source, destination] = [identity(vfs, '/gnk/from.txt'), identity(vfs, '/gnk/to.txt')]
    vfs.renameSync('/gnk/from.txt', '/gnk/to.txt')
    const renamed = identity(vfs, '/gnk/to.txt')
    expect(vfs.readFileSync('/gnk/to.txt', 'utf8')).toBe('moved')
    expect([renamed === source, renamed === destination]).toEqual([true, false])
  })
})

describe('modification time', () => {
  it('hydrates explicit metadata without confusing timestamps with permission bits', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/gnk/restored', 'value', { mode: 0o600, mtimeMs: 1_600_000_000_000 })
    vfs.seedDirectory('/gnk/restored-directory', { mode: 0o700, mtimeMs: 1_600_000_000_001 })
    const stats = vfs.statSync('/gnk/restored') as VfsStats
    const directory = vfs.statSync('/gnk/restored-directory') as VfsStats
    expect([stats.mode & 0o777, stats.mtimeMs]).toEqual([0o600, 1_600_000_000_000])
    expect([directory.mode & 0o777, directory.mtimeMs]).toEqual([0o700, 1_600_000_000_001])
  })

  it('advances on every write even while the clock stands still', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seed('/gnk/log.jsonl', 'first\n')
    const seeded = modified(vfs, '/gnk/log.jsonl')
    vfs.writeFileSync('/gnk/log.jsonl', 'second\n')
    const written = modified(vfs, '/gnk/log.jsonl')
    vfs.appendFileSync('/gnk/log.jsonl', 'third\n')
    const appended = modified(vfs, '/gnk/log.jsonl')
    vfs.truncateSync('/gnk/log.jsonl', 6)
    const truncated = modified(vfs, '/gnk/log.jsonl')
    expect([written > seeded, appended > written, truncated > appended]).toEqual([true, true, true])
    // One millisecond per revision: the increment is the minimum that separates
    // two tokens, not a coarser bump that would skew a real timestamp.
    expect(truncated - seeded).toBe(3)
  })

  it('takes the clock once the clock has passed the entry', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seed('/gnk/log.jsonl', 'first\n')
    clock.mockReturnValue(1_700_000_005_000)
    vfs.writeFileSync('/gnk/log.jsonl', 'second\n')
    expect(modified(vfs, '/gnk/log.jsonl')).toBe(1_700_000_005_000)
  })

  it('extends truncation with zero bytes', async () => {
    const vfs = new MemoryVfs()
    vfs.seed('/gnk/file', new Uint8Array([1, 2]))
    vfs.truncateSync('/gnk/file', 5)
    expect([...vfs.readFileSync('/gnk/file') as Uint8Array]).toEqual([1, 2, 0, 0, 0])
    const handle = vfs.open('/gnk/file', 'r+')
    await handle.truncate(7)
    expect([...vfs.readFileSync('/gnk/file') as Uint8Array]).toEqual([1, 2, 0, 0, 0, 0, 0])
  })

  it('advances a directory only when its immediate entry set changes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/gnk/workspace')
    const empty = modified(vfs, '/gnk/workspace')
    vfs.writeFileSync('/gnk/workspace/file.txt', 'one')
    const created = modified(vfs, '/gnk/workspace')
    vfs.writeFileSync('/gnk/workspace/file.txt', 'two')
    const rewritten = modified(vfs, '/gnk/workspace')
    vfs.rmSync('/gnk/workspace/file.txt')
    const removed = modified(vfs, '/gnk/workspace')
    expect([created > empty, rewritten === created, removed > rewritten]).toEqual([true, true, true])
  })
})

describe('mutation publication', () => {
  it('publishes only committed runtime changes and keeps image seeding silent', () => {
    const vfs = new MemoryVfs()
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })
    vfs.seed('/gnk/seeded.txt', 'seeded')
    expect(mutations).toEqual([])
    vfs.writeFileSync('/gnk/seeded.txt', 'changed')
    vfs.mkdirSync('/gnk/created')
    vfs.chmodSync('/gnk/created', 0o700)
    vfs.renameSync('/gnk/seeded.txt', '/gnk/renamed.txt')
    vfs.rmSync('/gnk/created', { recursive: true })
    expect(mutations.map(mutation => ({
      kind: mutation.kind,
      path: mutation.path,
      ...mutation.kind === 'write' ? { entryChanged: mutation.entryChanged } : {},
      ...mutation.kind === 'chmod' ? { mode: mutation.mode } : {},
    }))).toEqual([
      { kind: 'write', path: '/gnk/seeded.txt', entryChanged: false },
      { kind: 'mkdir', path: '/gnk/created' },
      { kind: 'chmod', path: '/gnk/created', mode: 0o700 },
      { kind: 'remove', path: '/gnk/seeded.txt' },
      { kind: 'write', path: '/gnk/renamed.txt', entryChanged: true },
      { kind: 'remove', path: '/gnk/created' },
    ])
    const renamed = mutations[4]
    expect(renamed?.kind === 'write' && new TextDecoder().decode(renamed.bytes)).toBe('changed')
    expect(() => { vfs.writeFileSync('/missing/file', 'no') }).toThrow(/ENOENT/)
    expect(mutations).toHaveLength(6)
  })

  it('contains a faulty observer and lets disposal stop later notifications', () => {
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/gnk')
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = vfs.subscribe(() => { throw new Error('observer failed') })
    const seen: string[] = []
    const second = vfs.subscribe((mutation) => { seen.push(mutation.path) })
    vfs.writeFileSync('/gnk/one', '1')
    first()
    second()
    vfs.writeFileSync('/gnk/two', '2')
    expect(seen).toEqual(['/gnk/one'])
    expect(reported).toHaveBeenCalledOnce()
  })

  it('feeds the same complete mutations to a durable sink and live subscribers', async () => {
    const recorded: VfsMutation[] = []
    let flushes = 0
    const sink: VfsMutationSink = {
      record: (mutation) => { recorded.push(mutation) },
      flush: async () => { flushes += 1 },
    }
    const vfs = new MemoryVfs({ sink })
    vfs.seedDirectory('/gnk')
    const observed: VfsMutation[] = []
    vfs.subscribe((mutation) => { observed.push(mutation) })
    vfs.writeFileSync('/gnk/log', 'a')
    vfs.appendFileSync('/gnk/log', 'bc')
    await vfs.flush()
    expect(observed).toEqual(recorded)
    expect(observed[0]).toBe(recorded[0])
    expect(recorded[0]).toMatchObject({ kind: 'write', path: '/gnk/log', mode: 0o644, entryChanged: true })
    expect(recorded[1]).toMatchObject({ kind: 'write', path: '/gnk/log', mode: 0o644, entryChanged: false, appendedFrom: 1 })
    expect(recorded[1]?.kind === 'write' && new TextDecoder().decode(recorded[1].bytes)).toBe('abc')
    expect(flushes).toBe(1)
  })

  it('publishes descriptor writes at the file identity current path', () => {
    const mutations: VfsMutation[] = []
    const vfs = new MemoryVfs()
    vfs.seed('/gnk/source', 'old')
    const descriptor = vfs.openFileSync('/gnk/source', 'r+')
    vfs.subscribe((mutation) => { mutations.push(mutation) })
    vfs.renameSync('/gnk/source', '/gnk/destination')
    mutations.length = 0
    descriptor.write(0, new TextEncoder().encode('new'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/gnk/destination'])
    expect(vfs.readFileSync('/gnk/destination', 'utf8')).toBe('new')
    vfs.unlinkSync('/gnk/destination')
    mutations.length = 0
    descriptor.write(0, new TextEncoder().encode('detached'))
    expect(mutations).toEqual([])
    expect(new TextDecoder().decode(descriptor.read(0, descriptor.stat().size))).toBe('detached')
  })

  it('decomposes a directory rename into replayable destination state', () => {
    const recorded: VfsMutation[] = []
    const vfs = new MemoryVfs({
      sink: { record: (mutation) => { recorded.push(mutation) }, flush: () => Promise.resolve() },
    })
    vfs.seedDirectory('/gnk/staging/nested', { mode: 0o700 })
    vfs.seed('/gnk/staging/nested/file', 'value', { mode: 0o600 })
    vfs.renameSync('/gnk/staging', '/gnk/published')

    expect(recorded.map(mutation => [mutation.kind, mutation.path])).toEqual([
      ['remove', '/gnk/staging'],
      ['mkdir', '/gnk/published'],
      ['mkdir', '/gnk/published/nested'],
      ['write', '/gnk/published/nested/file'],
    ])
    expect(recorded[3]).toMatchObject({ kind: 'write', mode: 0o600, entryChanged: true })
    expect(recorded[3]?.kind === 'write' && new TextDecoder().decode(recorded[3].bytes)).toBe('value')
  })
})

describe('directory rename', () => {
  it('rejects file, non-empty directory, and missing-parent destinations before mutation', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/gnk/source/nested/file', 'source')
    vfs.seed('/gnk/file', 'destination')
    vfs.seed('/gnk/non-empty/child', 'destination')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    expect(() => { vfs.renameSync('/gnk/source', '/gnk/file') })
      .toThrow(expect.objectContaining({ code: 'ENOTDIR' }))
    expect(() => { vfs.renameSync('/gnk/source', '/gnk/non-empty') })
      .toThrow(expect.objectContaining({ code: 'ENOTEMPTY' }))
    expect(() => { vfs.renameSync('/gnk/source', '/missing/destination') })
      .toThrow(expect.objectContaining({ code: 'ENOENT' }))

    expect(vfs.readFileSync('/gnk/source/nested/file', 'utf8')).toBe('source')
    expect(vfs.readFileSync('/gnk/file', 'utf8')).toBe('destination')
    expect(vfs.readFileSync('/gnk/non-empty/child', 'utf8')).toBe('destination')
    expect(mutations).toEqual([])
  })

  it('replaces an empty directory with the source subtree', () => {
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/gnk/source/nested', { mode: 0o700 })
    vfs.seed('/gnk/source/nested/file', 'source')
    vfs.seedDirectory('/gnk/destination', { mode: 0o711 })

    vfs.renameSync('/gnk/source', '/gnk/destination')

    expect(vfs.existsSync('/gnk/source')).toBe(false)
    expect(vfs.readFileSync('/gnk/destination/nested/file', 'utf8')).toBe('source')
    expect((vfs.statSync('/gnk/destination') as VfsStats).mode & 0o777).toBe(0o755)
    expect((vfs.statSync('/gnk/destination/nested') as VfsStats).mode & 0o777).toBe(0o700)
  })
})

describe('hard links', () => {
  it('shares identity, bytes, and mode until one name is removed', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/gnk/session.jsonl', 'committed\n')
    vfs.linkSync('/gnk/session.jsonl', '/gnk/session-latest.jsonl')
    vfs.linkSync('/gnk/session-latest.jsonl', '/gnk/session-archive.jsonl')
    expect(identity(vfs, '/gnk/session-latest.jsonl')).toBe(identity(vfs, '/gnk/session.jsonl'))
    expect(linkCount(vfs, '/gnk/session.jsonl')).toBe(3n)
    expect(vfs.readFileSync('/gnk/session-latest.jsonl', 'utf8')).toBe('committed\n')
    const changedPaths: string[] = []
    vfs.subscribe((mutation) => { changedPaths.push(mutation.path) })
    vfs.appendFileSync('/gnk/session.jsonl', 'appended\n')
    expect(changedPaths).toEqual([
      '/gnk/session.jsonl',
      '/gnk/session-latest.jsonl',
      '/gnk/session-archive.jsonl',
    ])
    expect(vfs.readFileSync('/gnk/session.jsonl', 'utf8')).toBe('committed\nappended\n')
    expect(vfs.readFileSync('/gnk/session-latest.jsonl', 'utf8')).toBe('committed\nappended\n')
    vfs.chmodSync('/gnk/session-latest.jsonl', 0o600)
    expect((vfs.statSync('/gnk/session.jsonl') as VfsStats).mode & 0o777).toBe(0o600)
    vfs.unlinkSync('/gnk/session-latest.jsonl')
    expect(linkCount(vfs, '/gnk/session.jsonl')).toBe(2n)
    vfs.unlinkSync('/gnk/session-archive.jsonl')
    expect(linkCount(vfs, '/gnk/session.jsonl')).toBe(1n)
    expect(vfs.readFileSync('/gnk/session.jsonl', 'utf8')).toBe('committed\nappended\n')
  })

  it('treats rename between names of the same node as a no-op', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/gnk/source', 'value')
    vfs.linkSync('/gnk/source', '/gnk/alias')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    vfs.renameSync('/gnk/source', '/gnk/alias')

    expect(vfs.readFileSync('/gnk/source', 'utf8')).toBe('value')
    expect(vfs.readFileSync('/gnk/alias', 'utf8')).toBe('value')
    expect(linkCount(vfs, '/gnk/source')).toBe(2n)
    expect(mutations).toEqual([])
  })

  it('retargets linked names through file replacement and directory moves', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/gnk/replacement', 'replacement')
    vfs.seed('/gnk/target', 'old')
    vfs.linkSync('/gnk/target', '/gnk/target-alias')
    const replaced = vfs.openFileSync('/gnk/target', 'r+')
    vfs.renameSync('/gnk/replacement', '/gnk/target')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    replaced.write(0, new TextEncoder().encode('changed'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/gnk/target-alias'])
    expect(vfs.readFileSync('/gnk/target', 'utf8')).toBe('replacement')
    expect(vfs.readFileSync('/gnk/target-alias', 'utf8')).toBe('changed')
    expect(linkCount(vfs, '/gnk/target-alias')).toBe(1n)

    vfs.seed('/gnk/tree/file', 'tree')
    vfs.linkSync('/gnk/tree/file', '/gnk/outside')
    const moved = vfs.openFileSync('/gnk/tree/file', 'r+')
    vfs.renameSync('/gnk/tree', '/gnk/moved')
    mutations.length = 0
    moved.write(0, new TextEncoder().encode('moved'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/gnk/outside', '/gnk/moved/file'])
    expect(linkCount(vfs, '/gnk/moved/file')).toBe(2n)

    vfs.rmSync('/gnk/moved', { recursive: true })
    mutations.length = 0
    moved.write(0, new TextEncoder().encode('kept!'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/gnk/outside'])
    expect(vfs.readFileSync('/gnk/outside', 'utf8')).toBe('kept!')
    expect(linkCount(vfs, '/gnk/outside')).toBe(1n)
  })

  it('rejects renaming a file over an existing directory', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/gnk/file', 'value')
    vfs.seedDirectory('/gnk/directory')
    expect(() => { vfs.renameSync('/gnk/file', '/gnk/directory') }).toThrow(expect.objectContaining({ code: 'EISDIR' }))
    expect(vfs.readFileSync('/gnk/file', 'utf8')).toBe('value')
    expect(vfs.statSync('/gnk/directory').isDirectory()).toBe(true)
  })
})

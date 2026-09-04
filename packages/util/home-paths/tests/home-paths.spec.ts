import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_GNK_HOME_DISPLAY,
  GNK_HOME_DIR_NAME,
  canonicalizeWatchPath,
  defaultGnkHome,
  gnkHomeDisplay,
  gnkHomePath,
  expandHomePath,
  resolveGnkHome,
} from '@greeneek/gnk-home-paths'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('gnk path helpers', () => {
  it('owns the shared default GNK home directory name', () => {
    expect(GNK_HOME_DIR_NAME).toBe('.gnk')
    expect(DEFAULT_GNK_HOME_DISPLAY).toBe('~/.gnk')
    expect(defaultGnkHome()).toBe(join(homedir(), '.gnk'))
  })

  it('expands tilde paths without changing non-tilde paths', () => {
    expect(expandHomePath('~')).toBe(homedir())
    expect(expandHomePath('~/.gnk')).toBe(join(homedir(), '.gnk'))
    expect(expandHomePath('~\\.gnk')).toBe(join(homedir(), '.gnk'))
    expect(expandHomePath('/tmp/.gnk')).toBe('/tmp/.gnk')
    expect(expandHomePath('~other/.gnk')).toBe('~other/.gnk')
  })

  it('resolves explicit path before GNK_HOME and the default', () => {
    const envHome = join(homedir(), 'env-gnk')

    expect(resolveGnkHome('/tmp/explicit-gnk', { GNK_HOME: '~/env-gnk' })).toBe(resolve('/tmp/explicit-gnk'))
    expect(resolveGnkHome(undefined, { GNK_HOME: '~/env-gnk' })).toBe(envHome)
    expect(resolveGnkHome(undefined, {})).toBe(defaultGnkHome())
  })

  it('treats an empty or whitespace-only GNK_HOME as unset', () => {
    expect(resolveGnkHome(undefined, { GNK_HOME: '' })).toBe(defaultGnkHome())
    expect(resolveGnkHome(undefined, { GNK_HOME: '   ' })).toBe(defaultGnkHome())
  })

  it('joins child segments onto the resolved GNK_HOME', () => {
    vi.stubEnv('GNK_HOME', '~/env-gnk')
    expect(gnkHomePath()).toBe(join(homedir(), 'env-gnk'))
    expect(gnkHomePath('storages', 'cache')).toBe(join(homedir(), 'env-gnk', 'storages', 'cache'))
  })

  it('labels a resolved home by whether it is the default root', () => {
    expect(gnkHomeDisplay(resolve(defaultGnkHome()))).toBe('~/.gnk')
    expect(gnkHomeDisplay('/some/other/root')).toBe('$GNK_HOME')
  })

  it('canonicalizes a watcher ancestor while preserving a missing suffix', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gnk-watch-path-'))
    const target = join(root, 'target')
    const alias = join(root, 'alias')
    try {
      await mkdir(target)
      await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
      await expect(canonicalizeWatchPath(join(alias, 'later', 'config.yml'))).resolves.toBe(
        join(await realpath(target), 'later', 'config.yml'),
      )
      const file = join(root, 'file')
      await writeFile(file, 'not a directory')
      await expect(canonicalizeWatchPath(join(file, 'child'))).rejects.toMatchObject({ code: 'ENOTDIR' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

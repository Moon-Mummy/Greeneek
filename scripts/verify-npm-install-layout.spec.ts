import { describe, expect, it } from 'vitest'
import type { NpmPackageLock, RegistryIndex } from './benchmark-npm-resolution.ts'
import {
  assertDualGnkInstallLayout,
  buildDualGnkRegistry,
} from './verify-npm-install-layout.ts'

function validLayout(): NpmPackageLock {
  return {
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { '@greeneek/gnk': '0.2.0', 'gnk-previous': 'npm:@greeneek/gnk@0.1.0' } },
      'node_modules/@greeneek/cordis': { version: '4.0.1' },
      'node_modules/@greeneek/gnk': {
        version: '0.2.0',
        dependencies: { '@greeneek/gnk-child': '^0.2.0' },
        peerDependencies: { '@greeneek/cordis': '^4.0.1' },
      },
      'node_modules/@greeneek/gnk-child': {
        version: '0.2.0',
        dependencies: { '@greeneek/gnk-leaf': '^0.2.0' },
      },
      'node_modules/@greeneek/gnk-leaf': { version: '0.2.0' },
      'node_modules/gnk-previous': {
        name: '@greeneek/gnk',
        version: '0.1.0',
        dependencies: { '@greeneek/gnk-child': '^0.1.0' },
        peerDependencies: { '@greeneek/cordis': '^4.0.1' },
      },
      'node_modules/gnk-previous/node_modules/@greeneek/gnk-child': {
        version: '0.1.0',
        dependencies: { '@greeneek/gnk-leaf': '^0.1.0' },
      },
      'node_modules/gnk-previous/node_modules/@greeneek/gnk-leaf': { version: '0.1.0' },
    },
  }
}

describe('npm install layout verifier', () => {
  it('creates two incompatible versions of every GNK package', () => {
    const index: RegistryIndex = new Map([
      ['@greeneek/gnk', new Map([['0.1.1-rc.2', {
        name: '@greeneek/gnk',
        version: '0.1.1-rc.2',
        dependencies: { '@greeneek/gnk-child': '^0.1.1-rc.2' },
        peerDependencies: { '@greeneek/cordis': '^4.0.1' },
      }]])],
      ['@greeneek/gnk-child', new Map([['0.1.1-rc.2', {
        name: '@greeneek/gnk-child',
        version: '0.1.1-rc.2',
      }]])],
      ['@greeneek/cordis', new Map([['4.0.1', {
        name: '@greeneek/cordis',
        version: '4.0.1',
      }]])],
    ])

    const dual = buildDualGnkRegistry(index, '0.1.1-rc.2')

    expect([...dual.get('@greeneek/gnk')?.keys() ?? []]).toEqual(['0.1.0', '0.2.0'])
    expect(dual.get('@greeneek/gnk')?.get('0.1.0')).toMatchObject({
      version: '0.1.0',
      dependencies: { '@greeneek/gnk-child': '^0.1.0' },
      peerDependencies: { '@greeneek/cordis': '^4.0.1' },
    })
    expect(dual.get('@greeneek/gnk')?.get('0.2.0')).toMatchObject({
      version: '0.2.0',
      dependencies: { '@greeneek/gnk-child': '^0.2.0' },
    })
    expect(dual.get('@greeneek/cordis')).toBe(index.get('@greeneek/cordis'))
  })

  it('accepts isolated GNK releases with one shared Cordis installation', () => {
    expect(assertDualGnkInstallLayout(validLayout())).toEqual({
      gnkPackagesPerVersion: 3,
      checkedGnkEdges: 4,
    })
  })

  it('rejects an internal edge that crosses release versions', () => {
    const layout = validLayout()
    const packages = { ...layout.packages }
    Reflect.deleteProperty(packages, 'node_modules/gnk-previous/node_modules/@greeneek/gnk-leaf')

    expect(() => assertDualGnkInstallLayout({ ...layout, packages })).toThrow(
      'node_modules/gnk-previous/node_modules/@greeneek/gnk-child: dependencies '
      + '@greeneek/gnk-leaf resolves to node_modules/@greeneek/gnk-leaf@0.2.0, expected 0.1.0',
    )
  })

  it('rejects a second Cordis installation', () => {
    const layout = validLayout()
    const packages = {
      ...layout.packages,
      'node_modules/gnk-previous/node_modules/@greeneek/cordis': { version: '4.0.1' },
    }

    expect(() => assertDualGnkInstallLayout({ ...layout, packages })).toThrow(
      'expected one shared @greeneek/cordis',
    )
  })
})

/** Experimental-package publication and dependency constraints. */

import { describe, expect, it } from 'vitest'
import {
  checkExperimentalDependencyIsolation,
  checkExperimentalManifest,
  expectedGnkPackageFiles,
  type WorkspaceManifest,
} from './check-workspace-constraints.ts'

const experimental: WorkspaceManifest = {
  dir: 'packages/experimental/prototype',
  manifest: { name: '@greeneek/gnk-experimental-prototype', private: true },
}

describe('experimental workspace constraints', () => {
  it('requires the experimental package-name prefix', () => {
    expect(checkExperimentalManifest({
      ...experimental,
      manifest: { ...experimental.manifest, name: '@greeneek/gnk-prototype' },
    })).toEqual([
      '@greeneek/gnk-prototype: experimental package name must start with "@greeneek/gnk-experimental-"',
    ])
  })

  it('requires private manifests without publication metadata', () => {
    expect(checkExperimentalManifest(experimental)).toEqual([])
    expect(checkExperimentalManifest({
      ...experimental,
      manifest: { ...experimental.manifest, private: false, publishConfig: { access: 'public' } },
    })).toEqual([
      '@greeneek/gnk-experimental-prototype: experimental package must set "private": true',
      '@greeneek/gnk-experimental-prototype: experimental package must omit publishConfig',
    ])
  })

  it.each(['dependencies', 'optionalDependencies', 'peerDependencies'] as const)(
    'rejects release %s on an experimental package',
    (section) => {
      expect(checkExperimentalDependencyIsolation([experimental, {
        dir: 'packages/core/consumer',
        manifest: {
          name: '@greeneek/gnk-consumer',
          [section]: { '@greeneek/gnk-experimental-prototype': 'workspace:^' },
        },
      }])).toEqual([
        `@greeneek/gnk-consumer: ${section}.@greeneek/gnk-experimental-prototype must not reference an experimental package`,
      ])
    },
  )

  it('allows development and experimental consumers but rejects the Python release runtime', () => {
    const manifests: WorkspaceManifest[] = [experimental, {
      dir: 'packages/core/test-only',
      manifest: {
        name: '@greeneek/gnk-test-only',
        devDependencies: { '@greeneek/gnk-experimental-prototype': 'workspace:^' },
      },
    }, {
      dir: 'packages/experimental/consumer',
      manifest: {
        name: '@greeneek/gnk-experimental-consumer',
        dependencies: { '@greeneek/gnk-experimental-prototype': 'workspace:^' },
      },
    }, {
      dir: 'python/sdk-runtime',
      manifest: {
        name: '@greeneek/gnk-python-runtime',
        dependencies: { '@greeneek/gnk-experimental-prototype': 'workspace:^' },
      },
    }]

    expect(checkExperimentalDependencyIsolation(manifests)).toEqual([
      '@greeneek/gnk-python-runtime: dependencies.@greeneek/gnk-experimental-prototype must not reference an experimental package',
    ])
  })
})

describe('package payload constraints', () => {
  it('includes a declared profile patch without a package-name allowlist', () => {
    expect(expectedGnkPackageFiles({
      name: '@greeneek/gnk-private-profile',
      gnk: { bundle: { patch: './cordis.patch.yml' } },
    })).toEqual([
      'lib/index.js',
      'cordis.patch.yml',
      'lib/types/**/*.d.ts',
    ])
  })
})

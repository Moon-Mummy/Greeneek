/** Tests for client package modes and module requests. */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectClientPackageViolations,
  collectLocalSourceSpecifiers,
  collectRuntimeSourcePackageUses,
  collectRuntimeSourceSpecifiers,
  collectSourcePackageUses,
  fixClientPackageManifests,
  readClientDeclarations,
  type ClientDeclaration,
  type ClientPackage,
  type ClientPackageFacts,
} from './verify-client-packages.ts'

const CORDIS = '@greeneek/cordis'
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function declaration(
  short: string,
  fields: Partial<Omit<ClientDeclaration, 'name' | 'manifest'>> = {},
): ClientDeclaration {
  return {
    name: short.startsWith('@') ? short : '@greeneek/gnk-client-' + short,
    manifest: 'packages/client/' + short.replace(/^.*\//, '') + '/package.json',
    dynamic: true,
    external: [],
    inject: [],
    runtimeSourceUses: {},
    runtimeSourceSpecifiers: {},
    ...fields,
  }
}

function pkg(
  short: string,
  fields: Partial<Omit<ClientPackage, 'name' | 'manifest'>> = {},
): ClientPackage {
  return {
    ...declaration(short),
    staticLinked: false,
    sourceUses: {},
    runtimeSourceUses: {},
    dependencies: {},
    peerDependencies: { [CORDIS]: 'workspace:^' },
    devDependencies: { [CORDIS]: 'workspace:^' },
    ...fields,
  }
}

function facts(
  packages: readonly ClientPackage[],
  options: Partial<Omit<ClientPackageFacts, 'packages'>> = {},
): ClientPackageFacts {
  return {
    packages,
    declarations: options.declarations ?? packages,
    staticLinkedPackages: options.staticLinkedPackages ?? new Set(
      packages.filter(item => item.staticLinked).map(item => item.name),
    ),
    platformModules: options.platformModules ?? [],
    preloadedExternals: options.preloadedExternals ?? [],
    parserPreloadIds: options.parserPreloadIds
      ?? (options.preloadedExternals ?? []).map(value => value.replace(/\/client$/, '')),
    malformed: options.malformed ?? [],
  }
}

describe('source package uses', () => {
  it('counts type imports, module augmentations, dynamic imports, and JSX', () => {
    const uses = collectSourcePackageUses('feature.tsx', [
      "import type { A } from '@greeneek/gnk-a/subpath'",
      "declare module '@greeneek/gnk-client-ui-slots' {}",
      "const load = () => import('@greeneek/gnk-b/remote')",
      'export const view = <div />',
      "export type { Local } from './local.ts'",
    ].join('\n'))

    expect([...uses].sort()).toEqual([
      '@greeneek/gnk-a',
      '@greeneek/gnk-b',
      '@greeneek/gnk-client-ui-slots',
      'react',
    ])
    expect([...collectRuntimeSourcePackageUses('feature.tsx', [
      "import type { A } from '@greeneek/gnk-a/subpath'",
      "declare module '@greeneek/gnk-client-ui-slots' {}",
      "const load = () => import('@greeneek/gnk-b')",
      'export const view = <div />',
    ].join('\n'))].sort()).toEqual([
      '@greeneek/gnk-b',
      'react',
    ])
    expect([...collectRuntimeSourceSpecifiers('feature.tsx', [
      "import type { A } from '@greeneek/gnk-a/subpath'",
      "const load = () => import('@greeneek/gnk-b/remote')",
      'export const view = <div />',
    ].join('\n'))].sort()).toEqual([
      '@greeneek/gnk-b/remote',
      'react',
    ])
    expect([...collectLocalSourceSpecifiers('feature.ts', [
      "import type { A } from './types.ts'",
      "export { value } from './value.ts'",
      "const load = () => import('./lazy.ts')",
      "const legacy = require('./legacy.ts')",
      "declare module './augmentation.ts' {}",
      "import '@greeneek/gnk-a'",
    ].join('\n'))].sort()).toEqual([
      './lazy.ts',
      './legacy.ts',
      './types.ts',
      './value.ts',
    ])
  })
})

describe('package modes', () => {
  it('accepts one dynamic package and one statically linked package', () => {
    const dynamic = pkg('feature')
    const shell = pkg('ui-slots', { dynamic: false, staticLinked: true })
    expect(collectClientPackageViolations(facts([dynamic, shell]))).toEqual([])
  })

  it('rejects a package with both modes or neither mode', () => {
    const both = pkg('both', { staticLinked: true })
    const neither = pkg('neither', { dynamic: false })
    const found = collectClientPackageViolations(facts([both, neither]))
    expect(found).toHaveLength(2)
    expect(found.join('\n')).toContain('must be dynamic or statically linked, not both')
    expect(found.join('\n')).toContain('has no supported client package mode')
  })

  it('requires seeded workspace packages to use staticLinked and preloads to name dynamic rows', () => {
    const slots = declaration('ui-slots', { dynamic: false })
    const bootstrap = declaration('bootstrap', { dynamic: false })
    const found = collectClientPackageViolations(facts([], {
      declarations: [slots, bootstrap],
      platformModules: [slots.name],
      preloadedExternals: [bootstrap.name + '/client'],
    }))
    expect(found).toHaveLength(2)
    expect(found.join('\n')).toContain('does not use the staticLinked preset')
    expect(found.join('\n')).toContain('has no dynamic gnk.client row')
  })

  it('requires every preloaded external to have a parser preload row', () => {
    const bootstrap = declaration('bootstrap')
    expect(collectClientPackageViolations(facts([], {
      declarations: [bootstrap],
      preloadedExternals: [bootstrap.name + '/client'],
      parserPreloadIds: [],
    }))).toEqual([
      'packages/client/web/src/platform.ts: parser-preloaded external '
      + '"@greeneek/gnk-client-bootstrap/client" has no matching PARSER_PRELOAD_IDS row in '
      + 'packages/client/modules/src/index.ts',
    ])
  })
})

describe('module requests', () => {
  it('rejects runtime requests from one client feature package to another dynamic row', () => {
    const ui = declaration('ui', {
      external: ['@greeneek/gnk-client-slots/client'],
      runtimeSourceUses: {
        '@greeneek/gnk-client-slots': ['packages/client/ui/src/client/index.ts'],
      },
    })
    const slots = declaration('slots')
    expect(collectClientPackageViolations(facts([], { declarations: [ui, slots] }))).toEqual([
      ui.manifest + ': client feature package requests runtime external '
      + '"@greeneek/gnk-client-slots/client"; import shared types only or call an injected Cordis service',
    ])
  })

  it('rejects stale externals and accepts a runtime import outside client feature packages', () => {
    const gateway = {
      ...declaration('@greeneek/gnk-api-gateway'), manifest: 'packages/api/gateway/package.json',
    }
    const stale = { ...declaration('@greeneek/gnk-api-stale', {
      external: ['@greeneek/gnk-api-gateway/client'],
    }), manifest: 'packages/api/stale/package.json' }
    const live = { ...declaration('@greeneek/gnk-api-live', {
      external: ['@greeneek/gnk-api-gateway/client'],
      runtimeSourceUses: {
        '@greeneek/gnk-api-gateway': ['packages/api/live/src/client/index.ts'],
      },
      runtimeSourceSpecifiers: {
        '@greeneek/gnk-api-gateway/client': ['packages/api/live/src/client/index.ts'],
      },
    }), manifest: 'packages/api/live/package.json' }
    expect(collectClientPackageViolations(facts([], {
      declarations: [gateway, stale, live],
    }))).toEqual([
      stale.manifest + ': gnk.client.external "@greeneek/gnk-api-gateway/client"'
      + ' has no runtime import or re-export in production source; remove the stale declaration',
    ])
  })

  it('requires the exact external subpath to be imported at runtime', () => {
    const gateway = {
      ...declaration('@greeneek/gnk-api-gateway'), manifest: 'packages/api/gateway/package.json',
    }
    const subject = { ...declaration('@greeneek/gnk-api-session-controller', {
      external: ['@greeneek/gnk-api-gateway/client'],
      runtimeSourceUses: {
        '@greeneek/gnk-api-gateway': ['packages/api/session-controller/src/client/index.ts'],
      },
      runtimeSourceSpecifiers: {
        '@greeneek/gnk-api-gateway/remote': ['packages/api/session-controller/src/client/index.ts'],
      },
    }), manifest: 'packages/api/session-controller/package.json' }
    expect(collectClientPackageViolations(facts([], { declarations: [gateway, subject] }))).toEqual([
      subject.manifest + ': gnk.client.external "@greeneek/gnk-api-gateway/client"'
      + ' has no runtime import or re-export in production source; remove the stale declaration',
    ])
  })

  it('rejects an explicit baseline request', () => {
    const ui = declaration('ui', { external: ['react'] })
    expect(collectClientPackageViolations(facts([], {
      declarations: [ui],
      platformModules: ['react'],
    }))).toEqual([
      ui.manifest + ': gnk.client.external repeats baseline module "react"; remove the explicit declaration',
    ])
  })

  it('rejects duplicates, empty values, self-requests, and missing suppliers', () => {
    const ui = declaration('ui', {
      external: ['', '@greeneek/gnk-client-ui', '@greeneek/gnk-missing', '@greeneek/gnk-missing'],
      inject: ['', '@greeneek/gnk-a', '@greeneek/gnk-a'],
    })
    const found = collectClientPackageViolations(facts([], { declarations: [ui] }))
    expect(found).toHaveLength(6)
    expect(found.join('\n')).toContain('gnk.client.external contains an empty value')
    expect(found.join('\n')).toContain('gnk.client.inject contains an empty value')
    expect(found.join('\n')).toContain('names its own row')
    expect(found.join('\n')).toContain('has no supplier')
  })

  it('rejects synchronous module-request cycles but ignores inject cycles', () => {
    const a = { ...declaration('@greeneek/gnk-api-a', {
      external: ['@greeneek/gnk-api-b'],
      inject: ['@greeneek/gnk-api-b'],
      runtimeSourceUses: { '@greeneek/gnk-api-b': ['packages/api/a/src/client.ts'] },
      runtimeSourceSpecifiers: { '@greeneek/gnk-api-b': ['packages/api/a/src/client.ts'] },
    }), manifest: 'packages/api/a/package.json' }
    const b = { ...declaration('@greeneek/gnk-api-b', {
      external: ['@greeneek/gnk-api-a'],
      inject: ['@greeneek/gnk-api-a'],
      runtimeSourceUses: { '@greeneek/gnk-api-a': ['packages/client/b/src/client.ts'] },
      runtimeSourceSpecifiers: { '@greeneek/gnk-api-a': ['packages/client/b/src/client.ts'] },
    }), manifest: 'packages/api/b/package.json' }
    const found = collectClientPackageViolations(facts([], { declarations: [a, b] }))
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('synchronous gnk.client.external cycle')
  })
})

describe('manifest declarations', () => {
  it('reports malformed arrays without hiding other packages', () => {
    const root = mkdtempSync(join(tmpdir(), 'client-packages-'))
    roots.push(root)
    const files: Record<string, unknown> = {
      'packages/g/a/package.json': {
        name: '@f/a', gnk: { client: { external: 'react', inject: ['@f/b', 1] } },
      },
      'packages/g/b/package.json': { name: '@f/b', gnk: { client: {} } },
    }
    for (const [path, value] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), JSON.stringify(value))
    }

    const result = readClientDeclarations(root)
    expect(result.declarations).toHaveLength(2)
    expect(result.malformed).toEqual([
      'packages/g/a/package.json: @f/a gnk.client.external must be a string array',
      'packages/g/a/package.json: @f/a gnk.client.inject must be a string array',
    ])
  })

  it('fixes malformed declaration entries without changing dependency sections', () => {
    const root = mkdtempSync(join(tmpdir(), 'client-packages-fix-'))
    roots.push(root)
    const subject = pkg('feature', {
      external: ['', 'react', '@greeneek/gnk-client-feature', '@greeneek/gnk-missing'],
      inject: ['', '@greeneek/gnk-agent', '@greeneek/gnk-agent'],
      sourceUses: {
        '@greeneek/gnk-agent': ['packages/client/feature/src/index.ts'],
        '@greeneek/gnk-client-ui-slots': ['packages/client/feature/src/view.tsx'],
      },
      dependencies: {
        [CORDIS]: 'workspace:^',
        '@greeneek/gnk-agent': 'workspace:*',
      },
      peerDependencies: {
        '@greeneek/gnk-client-ui-slots': 'workspace:^',
        '@greeneek/cordis-plugin-loader': 'workspace:^',
      },
      devDependencies: {},
    })
    const slots = declaration('ui-slots', { dynamic: false })
    const manifest = {
      name: subject.name,
      gnk: { client: { external: subject.external, inject: subject.inject, platform: 'web' } },
      dependencies: subject.dependencies,
      peerDependencies: subject.peerDependencies,
      devDependencies: subject.devDependencies,
    }
    mkdirSync(dirname(join(root, subject.manifest)), { recursive: true })
    writeFileSync(join(root, subject.manifest), JSON.stringify(manifest))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true }))

    expect(fixClientPackageManifests(root, facts([subject], {
      declarations: [subject, slots],
      staticLinkedPackages: new Set([slots.name]),
      platformModules: ['react', slots.name],
    }))).toEqual([subject.manifest])

    const fixed = JSON.parse(readFileSync(join(root, subject.manifest), 'utf8')) as {
      gnk: { client: { external: string[]; inject: string[] } }
      dependencies?: Record<string, string>
      peerDependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(fixed.gnk.client).toMatchObject({
      external: ['@greeneek/gnk-missing'],
      inject: ['@greeneek/gnk-agent'],
    })
    expect(fixed.dependencies).toEqual(subject.dependencies)
    expect(fixed.peerDependencies).toEqual(subject.peerDependencies)
    expect(fixed.devDependencies).toEqual(subject.devDependencies)
  })
})

/**
 * Resolve the public SDK launch configuration to one gnk subprocess.
 * @module @greeneek/gnk-sdk-client/launch
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HarnessClientOptions } from './types.ts'

/** Default bound for a profile to answer the SDK initialize handshake. */
export const DEFAULT_INITIALIZE_TIMEOUT_MS = 10_000

/** Internal generic process launch used by the transport and fake-runtime tests. */
export interface RuntimeProcessOptions {
  command: string
  args: string[]
  cwd?: string
  /** Materialize the complete child environment when the client starts its subprocess. */
  environment: () => NodeJS.ProcessEnv
  description: string
  initializeTimeoutMs: number
  requestTimeoutMs?: number
  shutdownTimeoutMs?: number
  disposeEofGraceMs?: number
  disposeGraceMs?: number
}

/** Node argv plus internal profile patches required by one resolved gnk entry. */
export interface GnkNodeLaunch {
  /** Arguments before the profile selector. */
  nodeArgs: string[]
  /** Internal patches applied below caller-supplied patches. */
  patches: string[]
  /** Environment values required by the resolved entry mode. */
  environment: NodeJS.ProcessEnv
}

interface PackageManifest {
  version?: unknown
  bin?: unknown
}

/** Read a package manifest from one resolved package.json URL. */
function manifest(url: string): PackageManifest {
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as PackageManifest
}

/**
 * Resolve and version-check a gnk executable from package manifests.
 * @param gnkManifestUrl - resolved URL of the gnk package manifest.
 * @param clientManifestUrl - resolved URL of the SDK client manifest.
 * @returns the absolute gnk executable path.
 */
export function resolveGnkBinFromManifests(gnkManifestUrl: string, clientManifestUrl: string): string {
  const gnkManifest = manifest(gnkManifestUrl)
  const clientManifest = manifest(clientManifestUrl)
  if (typeof gnkManifest.version !== 'string' || gnkManifest.version !== clientManifest.version) {
    throw new Error(`gnk SDK client ${String(clientManifest.version)} requires the same gnk version, got ${String(gnkManifest.version)}`)
  }
  const bin = typeof gnkManifest.bin === 'object' && gnkManifest.bin !== null
    ? (gnkManifest.bin as Record<string, unknown>).gnk
    : gnkManifest.bin
  if (typeof bin !== 'string' || bin === '') throw new Error('@greeneek/gnk declares no gnk executable')
  return resolve(dirname(fileURLToPath(gnkManifestUrl)), bin)
}

/**
 * Resolve and version-check the built gnk executable installed with this SDK.
 * @returns the absolute built executable path, whether or not it exists in a source checkout.
 */
export function installedGnkBin(): string {
  return resolveGnkBinFromManifests(
    import.meta.resolve('@greeneek/gnk/package.json'),
    new URL('../package.json', import.meta.url).href,
  )
}

/**
 * Resolve the Node launch for one same-version gnk package.
 * @param gnkManifestUrl - resolved URL of the gnk package manifest.
 * @param clientManifestUrl - resolved URL of the SDK client manifest.
 * @param sourceLoaderUrl - optional absolute tsx loader URL for deterministic tests.
 * @returns built output, or the source entry plus its compatibility patch and tsx environment.
 */
export function resolveGnkNodeLaunchFromManifests(
  gnkManifestUrl: string,
  clientManifestUrl: string,
  sourceLoaderUrl?: string,
): GnkNodeLaunch {
  const bin = resolveGnkBinFromManifests(gnkManifestUrl, clientManifestUrl)
  if (existsSync(bin)) return { nodeArgs: [bin], patches: [], environment: {} }

  const packageDir = dirname(fileURLToPath(gnkManifestUrl))
  const sourceBin = resolve(packageDir, 'src/bin.ts')
  const sourcePatch = resolve(packageDir, 'src/sdk-source.cordis.patch.yml')
  const sourceTsconfig = resolve(packageDir, 'tsconfig.json')
  if (!existsSync(sourceBin) || !existsSync(sourcePatch) || !existsSync(sourceTsconfig)) {
    throw new Error(
      `@greeneek/gnk is missing its built executable ${bin} and complete source launch files ${sourceBin}, ${sourcePatch}, ${sourceTsconfig}`,
    )
  }
  const loader = sourceLoaderUrl ?? import.meta.resolve('tsx/esm')
  return {
    nodeArgs: ['--import', loader, sourceBin],
    patches: [sourcePatch],
    environment: { TSX_TSCONFIG_PATH: sourceTsconfig },
  }
}

/**
 * Resolve the installed gnk package to a built or source Node launch.
 * @returns the launch descriptor for the current checkout or installed package.
 */
function installedGnkNodeLaunch(): GnkNodeLaunch {
  return resolveGnkNodeLaunchFromManifests(
    import.meta.resolve('@greeneek/gnk/package.json'),
    new URL('../package.json', import.meta.url).href,
  )
}

/**
 * Resolve caller-relative filesystem inputs and construct canonical gnk argv.
 * @param options - public SDK launch options.
 * @param callerCwd - parent-process directory used for lexical resolution.
 * @returns one generic subprocess spec for the JSON-RPC transport.
 */
export function resolveGnkLaunch(
  options: HarnessClientOptions = {},
  callerCwd: string = process.cwd(),
): RuntimeProcessOptions {
  const profile = options.profile ?? 'sdk'
  const gnkLaunch = options.gnkBin === undefined
    ? installedGnkNodeLaunch()
    : { nodeArgs: [resolve(callerCwd, options.gnkBin)], patches: [], environment: {} }
  const patches = [
    ...gnkLaunch.patches,
    ...(options.patches ?? []).map(path => resolve(callerCwd, path)),
  ]
  const gnkHome = options.gnkHome === undefined ? undefined : resolve(callerCwd, options.gnkHome)
  return {
    command: process.execPath,
    args: [...gnkLaunch.nodeArgs, '--profile', profile, ...patches.flatMap(path => ['--patch', path])],
    ...options.processCwd === undefined ? {} : { cwd: resolve(callerCwd, options.processCwd) },
    environment: () => ({
      ...(options.env ?? process.env),
      ...gnkLaunch.environment,
      ...gnkHome === undefined ? {} : { GNK_HOME: gnkHome },
    }),
    description: `gnk profile ${JSON.stringify(profile)}`,
    initializeTimeoutMs: options.initializeTimeoutMs ?? DEFAULT_INITIALIZE_TIMEOUT_MS,
    ...options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs },
    ...options.shutdownTimeoutMs === undefined ? {} : { shutdownTimeoutMs: options.shutdownTimeoutMs },
    ...options.disposeEofGraceMs === undefined ? {} : { disposeEofGraceMs: options.disposeEofGraceMs },
    ...options.disposeGraceMs === undefined ? {} : { disposeGraceMs: options.disposeGraceMs },
  }
}

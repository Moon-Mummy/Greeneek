/** Explicit exceptions and Host packages for the published dependency policy. */

/** Packages treated as Client/Host packages without declaring `gnk.client`. */
const CLIENT_FACE_INCLUDE: readonly string[] = []

/** Packages exempted from automatic Client/Host treatment despite declaring `gnk.client`. */
const CLIENT_FACE_EXCLUDE: readonly string[] = [
  '@greeneek/gnk-api-session-controller',
  '@greeneek/gnk-api-workspace-controller',
]

/** Host-only packages whose peer relays are deliberately flattened. */
const HOST_DEPENDENCY_PACKAGES: readonly string[] = [
  '@greeneek/gnk-llm',
  '@greeneek/gnk-session',
]

/** Development-only package relationships not represented by source imports. */
const CONFIGURATION_ONLY_DEV_DEPENDENCIES = {
  '@greeneek/gnk-client-locale': ['@greeneek/gnk-api-remotes'],
  '@greeneek/gnk-client-ui-conversation': [
    '@greeneek/gnk-api-remotes',
    '@greeneek/gnk-client-ui-workspace',
  ],
  '@greeneek/gnk-client-ui-model-selection': ['@greeneek/gnk-client-ui-input-trigger'],
  '@greeneek/gnk-client-ui-sidebar': ['@greeneek/gnk-client-ui-workspace'],
  '@greeneek/gnk-client-ui-subagent': ['@greeneek/gnk-client-ui-input-trigger'],
  '@greeneek/gnk-client-ui-theme': ['@greeneek/gnk-api-remotes'],
  '@greeneek/gnk-client-ui-tool': ['@greeneek/gnk-api-remotes'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/** Workspace packages whose complete runtime surface is safe across duplicate installations. */
const DUPLICATE_SAFE_PACKAGES: readonly string[] = [
  '@greeneek/gnk-brand',
  '@greeneek/gnk-typert-protocol',
  '@greeneek/gnk-util-crypto',
  '@greeneek/gnk-util-values',
]

/**
 * Runtime exports whose values remain valid when npm installs another package copy.
 */
const SAFE_HOST_DEPENDENCY_EXPORTS = {
  '@greeneek/gnk-credentials': ['credentialKey'],
  '@greeneek/gnk-deque': ['Deque'],
  '@greeneek/gnk-llm': ['callConfigEquals'],
  '@greeneek/gnk-timeout': ['MAX_TIMER_DELAY_MS'],
  '@greeneek/schemastery': ['default'],
} as const satisfies HostDependencyExports

/** Runtime exports that require every consumer to resolve the provider's shared peer instance. */
const PEER_REQUIRED_HOST_EXPORTS = {
  '@greeneek/gnk-scope': ['carrierKeyOf', 'scopeOf', 'scopeTarget'],
  '@greeneek/gnk-session-persistence': ['SessionPersistenceNotFoundError'],
} as const satisfies HostDependencyExports

/** Exact import specifier to reviewed runtime exports. */
type HostDependencyExports = Readonly<Record<string, readonly string[]>>

/** Complete configurable input to package dependency classification. */
export interface PackageDependencyPolicy {
  readonly clientFaceInclude: readonly string[]
  readonly clientFaceExclude: readonly string[]
  readonly hostPackages: readonly string[]
  readonly configurationOnlyDevDependencies: Readonly<Record<string, readonly string[]>>
  readonly duplicateSafePackages?: readonly string[]
  readonly safeHostDependencyExports: HostDependencyExports
  readonly peerRequiredHostExports: HostDependencyExports
}

/** Repository dependency policy consumed by verification and benchmarking. */
export const PACKAGE_DEPENDENCY_POLICY: PackageDependencyPolicy = {
  clientFaceInclude: CLIENT_FACE_INCLUDE,
  clientFaceExclude: CLIENT_FACE_EXCLUDE,
  hostPackages: HOST_DEPENDENCY_PACKAGES,
  configurationOnlyDevDependencies: CONFIGURATION_ONLY_DEV_DEPENDENCIES,
  duplicateSafePackages: DUPLICATE_SAFE_PACKAGES,
  safeHostDependencyExports: SAFE_HOST_DEPENDENCY_EXPORTS,
  peerRequiredHostExports: PEER_REQUIRED_HOST_EXPORTS,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether a package manifest declares a dynamically loaded Client entry. */
export function hasClientDeclaration(gnkField: unknown): boolean {
  return isRecord(gnkField) && Object.hasOwn(gnkField, 'client')
}

/** Whether the repository policy flattens one package's non-Cordis peers. */
export function usesFlattenedPackageDependencies(
  manifestPath: string,
  packageName: string,
  gnkField: unknown,
  policy: PackageDependencyPolicy = PACKAGE_DEPENDENCY_POLICY,
): boolean {
  if (!manifestPath.startsWith('packages/') || manifestPath.startsWith('packages/experimental/')) return false
  if (policy.hostPackages.includes(packageName)) return true
  if (manifestPath.startsWith('packages/client/')) return true
  const included = hasClientDeclaration(gnkField) || policy.clientFaceInclude.includes(packageName)
  return included && !policy.clientFaceExclude.includes(packageName)
}

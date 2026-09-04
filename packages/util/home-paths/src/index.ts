/**
 * Shared filesystem path helpers for Greeneek Harness user data.
 *
 * @module @greeneek/gnk-home-paths
 */

import { access, cp, opendir, realpath, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

/** Directory name for the default Greeneek Harness home under the OS home. */
export const GNK_HOME_DIR_NAME = '.gnk'

/** Stable user-facing display form for the default Greeneek Harness home. */
export const DEFAULT_GNK_HOME_DISPLAY = `~/${GNK_HOME_DIR_NAME}`

/** Environment variable that overrides the default Greeneek Harness home. */
export const GNK_HOME_ENV = 'GNK_HOME'

/**
 * Pre-rebrand overrides. The harness was `dsh` with home `~/.dsh` and // rebrand:keep
 * `$DSH_HOME`; these keep working with a one-time deprecation warning so an // rebrand:keep
 * existing install does not lose its home on upgrade. Support ends at v1.0.
 */
export const LEGACY_HOME_ENV = 'DSH_HOME' // rebrand:keep
/** Legacy home directory names, in probe order (oldest brand first). */
export const LEGACY_HOME_DIR_NAMES = ['.dsh'] as const // rebrand:keep

/**
 * Give a native filesystem watcher one canonical spelling of a path, even
 * when its final components do not exist yet. The deepest existing ancestor
 * is resolved through {@link realpath}; when a suffix is missing, that
 * ancestor is also proved to be an enumerable directory before the suffix is
 * restored. This prevents Windows from treating a regular-file ancestor as
 * ordinary absence, and prevents short-name aliases from being mixed with
 * long paths emitted by the native watcher backend.
 * @param path - Watch target or root, resolved against the current directory.
 * @returns the target with its existing ancestor canonicalized.
 * @throws when ancestor traversal encounters an error other than absence, or
 * the existing ancestor of a missing suffix is not an enumerable directory.
 */
export async function canonicalizeWatchPath(path: string): Promise<string> {
  let current = resolve(path)
  const missing: string[] = []
  while (true) {
    try {
      const canonical = await realpath(current)
      if (missing.length > 0) {
        // A Windows file-as-parent probe reports ENOENT. Opening the resolved
        // ancestor preserves the cross-platform directory requirement.
        const directory = await opendir(canonical)
        await directory.close()
      }
      return join(canonical, ...missing.reverse())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = dirname(current)
      /* v8 ignore next -- a filesystem root exists, so traversal resolves before this guard */
      if (parent === current) throw error
      missing.push(basename(current))
      current = parent
    }
  }
}

/**
 * Resolve the default Greeneek Harness home using Node's platform path rules.
 * @returns the absolute default harness home path.
 */
export function defaultGnkHome(): string {
  return join(homedir(), GNK_HOME_DIR_NAME)
}

/**
 * Expand supported tilde prefixes against the operating-system home.
 * @param path - configured path that may begin with `~`, `~/`, or `~\`.
 * @returns the expanded path, or the original value when no supported prefix is present.
 */
export function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * Resolve the single-root Greeneek Harness home.
 *
 * Precedence, highest first: an explicit configured path, `$GNK_HOME`, then
 * `~/.gnk`. The harness keeps all user data under one root. An empty or
 * whitespace-only `$GNK_HOME` is treated as unset, so a blank override never
 * resolves the home to the current working directory.
 * @param configured - explicit harness-home override, which has highest precedence.
 * @param env - environment mapping used to read `GNK_HOME`.
 * @returns the normalized absolute harness home path.
 */
export function resolveGnkHome(configured?: string, env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env[GNK_HOME_ENV] ?? readLegacyHomeEnv(env)
  const selected = configured ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : defaultGnkHome())
  return resolve(expandHomePath(selected))
}

const warned = new Set<string>()

/**
* The deprecated `$DSH_HOME` still selects the home for one release cycle, rebrand:keep
 * with a single loud notice per process (per launch, at worst) telling the
 * user the canonical spelling.
 * @param env - environment mapping to read.
 * @returns the legacy override value, or `undefined` when absent/blank.
 */
function readLegacyHomeEnv(env: Record<string, string | undefined>): string | undefined {
  const value = env[LEGACY_HOME_ENV]
  if (value === undefined || value.trim().length === 0) return undefined
  if (!warned.has(LEGACY_HOME_ENV)) {
    warned.add(LEGACY_HOME_ENV)
    console.warn(`$${LEGACY_HOME_ENV} is deprecated; set $${GNK_HOME_ENV} instead (support for the old name ends in v1.0)`)
  }
  return value
}

/**
 * Seed the Greeneek home from a legacy harness home, one time per machine.
 *
 * When `~/.gnk` does not exist yet but a legacy directory (e.g. `~/.dsh`) // rebrand:keep
 * does, its contents are COPIED — never moved — into the new home, and a
 * `MIGRATED-TO-GREENEEK.txt` notice is left in the legacy directory so the
 * user learns the copy is safe to delete. Copying (rather than moving) keeps
 * a rollback to an old build fully functional. The operation is idempotent:
 * an existing target directory short-circuits it, and a partially copied
 * legacy tree is never re-applied over user data.
 * @param home - OS home directory to act in; defaults to {@link homedir}.
 * @param env - environment mapping used to detect an explicit `$GNK_HOME`
 * (migration is skipped when the user pinned a custom home: they own it).
 * @returns what happened, for logging/tests.
 */
export async function migrateGnkHome(
  home = homedir(),
  env: Record<string, string | undefined> = process.env,
): Promise<{ migrated: false } | { migrated: true; from: string; to: string }> {
  if (env[GNK_HOME_ENV] !== undefined || env[LEGACY_HOME_ENV] !== undefined) return { migrated: false }
  const target = join(home, GNK_HOME_DIR_NAME)
  let targetExists = false
  try {
    await access(target)
    targetExists = true
  } catch {
    targetExists = false
  }
  if (targetExists) return { migrated: false }
  for (const legacy of LEGACY_HOME_DIR_NAMES) {
    const source = join(home, legacy)
    try {
      await access(source)
    } catch {
      continue
    }
    await cp(source, target, { recursive: true, errorOnExist: true, force: false })
    await writeFile(join(source, 'MIGRATED-TO-GREENEEK.txt'),
      `Your ${legacy} directory was copied to ${DEFAULT_GNK_HOME_DISPLAY} on ${new Date().toISOString()}.\n`
      + 'The new Greeneek home is authoritative from now on; this notice is safe to delete with the old directory.\n',
      'utf8')
    return { migrated: true, from: source, to: target }
  }
  return { migrated: false }
}

/**
 * Read the pre-rebrand `dshHome` config key of a plugin config object. // rebrand:keep
 *
 * The harness config surface renamed `dshHome` to `gnkHome`; consumers accept // rebrand:keep
 * either spelling so an existing `cordis.yml`/settings section keeps pointing
 * at the same home during the deprecation window (ends v1.0).
 * @param config - plugin config object that may still carry the legacy key.
 * @returns the legacy home value when present and non-empty.
 */
export function legacyHomeConfig(config: object): string | undefined {
  const legacy = (config as { dshHome?: unknown }).dshHome // rebrand:keep
  return typeof legacy === 'string' && legacy.length > 0 ? legacy : undefined
}

/**
 * Join path segments onto the resolved Greeneek Harness home.
 * @param segments - path segments appended to the Harness home; an empty list returns the home itself.
 * @returns the normalized absolute joined path.
 */
export function gnkHomePath(...segments: string[]): string {
  return join(resolveGnkHome(), ...segments)
}

/**
 * Describe a resolved harness home symbolically for user-facing display.
 *
 * It never returns an absolute machine path: the default home is labelled
 * `~/.gnk`, and any configured home is labelled `$GNK_HOME`.
 * @param resolvedHome - the absolute path returned by {@link resolveGnkHome}.
 * @returns `~/.gnk` for the default home, otherwise `$GNK_HOME`.
 */
export function gnkHomeDisplay(resolvedHome: string): string {
  return resolvedHome === resolve(defaultGnkHome()) ? DEFAULT_GNK_HOME_DISPLAY : `$${GNK_HOME_ENV}`
}

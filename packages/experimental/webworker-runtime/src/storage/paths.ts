/**
 * Virtual root of the worker host's in-memory filesystem. Kept
 * in one module so the process shim, the path/os shims, and the VFS image
 * collector cannot drift apart.
 */

/** Virtual filesystem root; `process.cwd()` and every absolute path start here. */
export const GNK_ROOT = '/gnk'

/** `$GNK_HOME`: durable-state directory inside the image. */
export const GNK_HOME = `${GNK_ROOT}/home`

/** Flat, symlink-free package tree resolved by the worker module loader. */
export const GNK_NODE_MODULES = `${GNK_ROOT}/node_modules`

/** Directory holding the composed cordis.yml and the agent-preset tree. */
export const GNK_CONFIG = `${GNK_ROOT}/config`

/** Default (empty) workspace directory. */
export const GNK_WORKSPACE = `${GNK_ROOT}/workspace`

/** Temporary directory reported by `os.tmpdir()`. */
export const GNK_TMP = `${GNK_ROOT}/tmp`

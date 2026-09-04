#!/usr/bin/env node
/**
 * Deprecated `dsh` launcher (removal target: v1.0). rebrand:keep
 *
 * Emits one migration notice and delegates to the `gnk` bin so pre-rebrand
 * scripts and muscle memory keep working through the deprecation window.
 * @module @greeneek/gnk/bin-legacy
 */

/* v8 ignore file -- built-bin acceptance exercises the main entry; this alias only delegates to it. */

export {}

console.error('[deprecated] `dsh` was renamed to `gnk`; the `dsh` launcher will be removed in v1.0.') // rebrand:keep
await import('./bin.ts')

/** Greeneek Files API identifiers. @module gnk-llm-greeneek/file-id */

import type { Branded } from '@greeneek/gnk-brand'

/** Opaque identifier returned by the Greeneek Files API. */
export type GreeneekFileId = Branded<'GreeneekFileId'>

/**
 * Brand a provider-returned file identifier after wire validation.
 * @param id - non-empty Files API identifier.
 * @returns the same string with its provider identity attached at type level.
 */
export function GreeneekFileId(id: string): GreeneekFileId {
  return id as GreeneekFileId
}

/** Non-secret digest identifying one endpoint and API-key file namespace. */
export type GreeneekFileScope = Branded<'GreeneekFileScope'>

/**
 * Brand a locally derived namespace digest.
 * @param scope - SHA-256 digest of endpoint and API key.
 * @returns the same string with namespace identity attached at type level.
 */
export function GreeneekFileScope(scope: string): GreeneekFileScope {
  return scope as GreeneekFileScope
}

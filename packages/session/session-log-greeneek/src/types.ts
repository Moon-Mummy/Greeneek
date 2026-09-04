/** Wire types for lossless incremental Greeneek session-log upload. */

import type { SessionEvent } from '@greeneek/gnk-session'
import type { JsonValue } from '@greeneek/gnk-util-values'

/** Version-0 Session header fields serialized on the external request wire. */
export interface GreeneekSessionLogWireHeader {
  readonly version: number
  readonly id: string
  readonly createdAt: number
  readonly cwd?: string
  readonly parentSession?: string
  /** Exact inherited prefix length; absent for an unseeded Session. */
  readonly seedLength?: number
  readonly origin?: 'subagent'
  readonly delegationDepth?: number
  readonly agentPreset?: string
}

/** Raw-number surface mutation serialized on the external request wire. */
export type GreeneekSessionLogWireSurfaceOp =
  | 'append'
  | { readonly op: 'replace'; readonly start: number; readonly end: number }

/** One complete canonical event translated to raw JSON primitives for upload. */
export interface GreeneekSessionLogWireEvent {
  readonly type: SessionEvent['type']
  readonly seq: number
  readonly time: number
  readonly data: JsonValue
  readonly ignorable?: true
  readonly sourceEventSeqs?: readonly number[]
  readonly surfaceOp?: GreeneekSessionLogWireSurfaceOp
}

/** Versioned incremental session-log field carried by an official Greeneek request. */
export interface GreeneekSessionLogExtension {
  readonly version: 1
  readonly session: GreeneekSessionLogWireHeader
  /** Highest sequence durably recorded as accepted before this request, or `-1`. */
  readonly afterSeq: number
  /** Highest sequence represented by {@link events}. */
  readonly throughSeq: number
  /** Complete canonical event envelopes for every sequence from `afterSeq + 1` through `throughSeq`. */
  readonly events: readonly GreeneekSessionLogWireEvent[]
}

declare module '@greeneek/gnk-greeneek-llm-api-extensions/types' {
  interface GreeneekLlmApiExtensionMap {
    gnk_session_log: GreeneekSessionLogExtension
  }
}

declare module '@greeneek/gnk-session/types' {
  interface SessionEventMap {
    /** Records that the configured endpoint accepted one delivery through `throughSeq`. */
    'session-log-greeneek/delivery-accepted': {
      /** Session identity the accepted delivery carried; inherited fork markers retain the parent's id. */
      sessionId: import('@greeneek/gnk-session/types').SessionId
      /** Last canonical event included in the accepted request. */
      throughSeq: import('@greeneek/gnk-session/types').SessionSeq
    }
  }
}

import type { TurnBoundaryProjection } from './types.ts'
import type {} from '@greeneek/gnk-session-projection'

declare module '@greeneek/gnk-session-projection/types' {
  interface SessionProjectionStateMap {
    /** The agent session's open/last turn and step boundary facts (whole value). */
    turnBoundary: TurnBoundaryProjection
  }
}

export {}

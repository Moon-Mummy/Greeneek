import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@greeneek/gnk-session-log-export',
  ['lib/types/index.js'],
  { hostPhase: true },
)

import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@greeneek/gnk-api-session-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)

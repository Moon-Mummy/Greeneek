import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@greeneek/gnk-api-remotes',
  ['lib/types/index.js'],
  { hostPhase: true },
)

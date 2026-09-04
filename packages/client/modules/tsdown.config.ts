import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  '@greeneek/gnk-client-modules',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)

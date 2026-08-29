import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  '@daoai/dao-client-modules',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)

import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@daoai/dao-api-remotes',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { hostPhase: true },
)

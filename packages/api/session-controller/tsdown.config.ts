import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@daoai/dao-api-session-controller',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { hostPhase: true },
)

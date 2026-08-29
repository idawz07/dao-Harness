import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@daoai/dao-session-log-export',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { hostPhase: true },
)

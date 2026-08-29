import { staticLinked } from '../tsdown.client.ts'

export default staticLinked(
  '@daoai/dao-client-store',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)

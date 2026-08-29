import { staticLinked } from '../tsdown.client.ts'

export default staticLinked(
  '@daoai/dao-client-web',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)

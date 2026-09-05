/**
 * Package-owned invariant companion for `@daoai/dao-squad-progress`.
 * @module @daoai/dao-squad-progress/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@daoai/cordis'
import type { InvariantInstaller } from '@daoai/dao-invariants'

const PACKAGE_NAME = '@daoai/dao-squad-progress'

/** Cordis companion plugin name. */
export const name = 'squad-progress-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the package owns a pure projection fold whose wire
 * payload is schema-validated by the projection registry, plus a storage-domain
 * mirror that reuses that same validated view. Tool-result pairing and turn
 * boundary relations are owned by dao-agent-loop and the session surface.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */

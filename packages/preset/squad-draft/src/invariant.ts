/** Package-owned invariant companion for `@daoai/dao-squad-draft`. */

/* jscpd:ignore-start */
import type { Context } from '@daoai/cordis'
import type { InvariantInstaller } from '@daoai/dao-invariants'

const PACKAGE_NAME = '@daoai/dao-squad-draft'
export const name = 'squad-draft-invariant'
export const inject = ['invariants']

/** No runtime invariant: the service performs one bounded request and stores no draft state. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */

/**
 * Package-owned invariant companion for `@daoai/dao-client-ui-squad-progress`.
 * @module @daoai/dao-client-ui-squad-progress/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@daoai/cordis'
import type { InvariantInstaller } from '@daoai/dao-invariants'

const PACKAGE_NAME = '@daoai/dao-client-ui-squad-progress'

/** Cordis companion plugin name. */
export const name = 'client-ui-squad-progress-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a set of keyed slot registrations and locale
 * dictionaries whose disposal is proven by the HMR-safety spec — they emit no
 * cordis events and own no cross-plugin mutable state.
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

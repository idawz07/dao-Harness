/**
 * Package-owned invariant companion for `@daoai/dao-anonymous-user-id`.
 * @module @daoai/dao-anonymous-user-id/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@daoai/cordis'
import type { InvariantInstaller } from '@daoai/dao-invariants'

const PACKAGE_NAME = '@daoai/dao-anonymous-user-id'

/** Cordis companion plugin name. */
export const name = 'anonymous-user-id-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the API owns one private memo and one best-effort
 * file, with no independent event stream or public mutable relation for a
 * companion to compare without creating the identity as a side effect.
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

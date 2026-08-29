/**
 * Package-owned invariant companion for `@daoai/dao-agent-instructions`.
 * @module @daoai/dao-agent-instructions/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@daoai/cordis'
import type { InvariantInstaller } from '@daoai/dao-invariants'

const PACKAGE_NAME = '@daoai/dao-agent-instructions'

/** Cordis companion plugin name. */
export const name = 'workspace-context-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: replay intentionally tolerates unknown or malformed workspace sources,
 * while focused pipeline tests own its private pending/cache state transitions.
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

/**
 * Host service that registers the `squadProgress` projection unit and mirrors
 * its wire view into the `squad_progress` storage-domain table.
 *
 * @module @daoai/dao-squad-progress
 */

import { Context, Service } from '@daoai/cordis'
import type { SessionId } from '@daoai/dao-session/types'
import type { KvTable } from '@daoai/dao-storage-domain'
import type {} from '@daoai/dao-session-projection'
import { squadProgressProjectionDefinition } from './projection.ts'
import {
  squadProgressDomainSpec,
  squadProgressRowFromView,
  type SquadProgressRow,
} from './spec.ts'
import type { SquadProgressProjection } from './types.ts'

export type * from './types.ts'
export {
  SQUAD_BADGE_RULES,
  earnBadges,
  type SquadBadgeCounters,
  type SquadBadgeRule,
} from './badges.ts'
export { levelFromXp } from './level.ts'
export {
  XP_CHILD_SETTLED,
  XP_CHILD_SPAWNED,
  XP_TOOL_SUCCESS,
  applyCompletedTurn,
  applySuccessfulToolResult,
  initSquadProgressState,
  isBackgroundDelegationStart,
  isDelegationToolName,
  isToolResultSuccess,
  toolResultText,
  type SquadProgressCounters,
  type SquadProgressState,
} from './progress.ts'
export { squadProgressProjectionDefinition } from './projection.ts'
export {
  squadProgressDomainSpec,
  squadProgressRowFromView,
  squadProgressRowSchema,
  type SquadProgressRow,
} from './spec.ts'

declare module '@daoai/cordis' {
  interface Context {
    squadProgress: SquadProgress
  }
}

/**
 * Registers the log-derived `squadProgress` projection and mirrors each
 * change into durable storage for host inspection. The projection remains the
 * client authority; storage is a same-lifecycle mirror.
 */
export class SquadProgress extends Service {
  static inject = ['sessionProjections', 'storageDomain']

  private table?: KvTable<SessionId, SquadProgressRow>

  /**
   * @param ctx - Host context carrying the projection registry and storage domain.
   */
  constructor(ctx: Context) {
    super(ctx, 'squadProgress')
    ctx.sessionProjections.register(squadProgressProjectionDefinition)
  }

  /** Open the mirror domain and subscribe to projection changes. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(squadProgressDomainSpec)
    this.ctx.effect(() => async () => {
      await domain.close()
    }, 'squad-progress.domainClose')
    const table = domain.table('sessions')
    this.table = table
    this.ctx.effect(() => this.ctx.sessionProjections.onChanged((session, key, value) => {
      if ((key as string) !== 'squadProgress') return
      const view = value as SquadProgressProjection
      void table.put(
        session.id,
        squadProgressRowFromView(session.id, view, Date.now()),
      )
    }), 'squad-progress.mirror')
  }

  /**
   * Read the last mirrored snapshot for a session id.
   * @param sessionId - session whose mirrored progress is requested.
   * @returns the stored row, or undefined when none has been written yet.
   */
  get(sessionId: SessionId): SquadProgressRow | undefined {
    return this.table?.get(sessionId)
  }
}

export default SquadProgress

/**
 * Durable storage-domain declaration for mirrored squad progress rows.
 * @module @daoai/dao-squad-progress/src/spec
 */

import { z } from 'zod'
import type { SessionId } from '@daoai/dao-session/types'
import { defineDomain, domainTable } from '@daoai/dao-storage-domain'
import type { SquadBadgeId, SquadProgressProjection } from './types.ts'

const badgeIdSchema = z.union([
  z.literal('first_delegation'),
  z.literal('ten_tools'),
  z.literal('error_free_turn'),
]) satisfies z.ZodType<SquadBadgeId>

/** One mirrored per-session progress snapshot for host reads and cold inspection. */
export const squadProgressRowSchema = z.object({
  sessionId: z.string().min(1).transform(value => value as SessionId),
  xp: z.number().int().nonnegative(),
  level: z.number().int().positive(),
  badges: z.array(badgeIdSchema),
  updatedAt: z.number().int().nonnegative(),
}).strict()

/** Persisted progress row inferred from {@link squadProgressRowSchema}. */
export type SquadProgressRow = z.infer<typeof squadProgressRowSchema>

/** Project a wire view into a durable row. */
export function squadProgressRowFromView(
  sessionId: SessionId,
  view: SquadProgressProjection,
  updatedAt: number,
): SquadProgressRow {
  return {
    sessionId,
    xp: view.xp,
    level: view.level,
    badges: [...view.badges],
    updatedAt,
  }
}

/** One progress snapshot per Session id (log-derived mirror, not an authority). */
export const squadProgressDomainSpec = defineDomain({
  name: 'squad_progress',
  version: 0,
  tables: {
    sessions: domainTable<SessionId, SquadProgressRow>(squadProgressRowSchema),
  },
})

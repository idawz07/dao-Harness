/**
 * Pure types of the squad-progress domain: badge ids, the client wire view,
 * and the ONE home of the `squadProgress` projection-key declaration.
 *
 * @module @daoai/dao-squad-progress/types
 */

// Marks this file a module so the declaration below AUGMENTS the projection
// table instead of declaring an ambient module.
export {}

/**
 * Closed badge vocabulary for the Stage 6 MVP rule table.
 * New badges are additive string ids; UI locale keys mirror these ids.
 */
export type SquadBadgeId = 'first_delegation' | 'ten_tools' | 'error_free_turn'

/**
 * Client-facing squad progress for one session: XP, derived level, and earned
 * badge ids in earn order. Every field folds from the durable session log.
 */
export interface SquadProgressProjection {
  /** Cumulative experience points awarded by the MVP rule table. */
  xp: number
  /** Level derived from XP: `floor(sqrt(xp / 10)) + 1`. */
  level: number
  /** Earned badge ids in first-earn order (no duplicates). */
  badges: readonly SquadBadgeId[]
}

declare module '@daoai/dao-session-projection/types' {
  interface SessionProjectionMap {
    /** Per-session squad XP, level, and badges; see {@link SquadProgressProjection}. */
    squadProgress: SquadProgressProjection
  }
}

/**
 * Declarative badge rule table and earn helpers for squad progress.
 *
 * @module @daoai/dao-squad-progress/badges
 */

import type { SquadBadgeId } from './types.ts'

/** One declarative badge rule evaluated after each XP-relevant fold step. */
export interface SquadBadgeRule {
  /** Stable badge id stored in the projection and locale dictionaries. */
  readonly id: SquadBadgeId
  /**
   * Whether the badge should be earned given the current counters.
   * Already-earned badges are never re-evaluated for insertion.
   */
  readonly matches: (counters: SquadBadgeCounters) => boolean
}

/** Counters the badge table reads; kept independent of the full fold state. */
export interface SquadBadgeCounters {
  /** Successful tool results so far (including delegation tools). */
  readonly toolSuccesses: number
  /** Successful delegation-tool results so far (spawn awards). */
  readonly spawnSuccesses: number
  /** Turns that completed with no tool errors so far. */
  readonly errorFreeTurns: number
}

/**
 * Closed MVP badge table. Order is evaluation order and first-earn order for
 * simultaneous awards in one fold step.
 */
export const SQUAD_BADGE_RULES: readonly SquadBadgeRule[] = Object.freeze([
  {
    id: 'first_delegation',
    matches: counters => counters.spawnSuccesses >= 1,
  },
  {
    id: 'ten_tools',
    matches: counters => counters.toolSuccesses >= 10,
  },
  {
    id: 'error_free_turn',
    matches: counters => counters.errorFreeTurns >= 1,
  },
])

/**
 * Append newly matched badges that are not already present.
 * @param badges - previously earned ids in earn order.
 * @param counters - current counters after the fold step.
 * @returns the same array reference when nothing is earned, otherwise a new array.
 */
export function earnBadges(
  badges: readonly SquadBadgeId[],
  counters: SquadBadgeCounters,
): readonly SquadBadgeId[] {
  const earned = new Set(badges)
  const next: SquadBadgeId[] = []
  for (const rule of SQUAD_BADGE_RULES) {
    if (earned.has(rule.id) || !rule.matches(counters)) continue
    next.push(rule.id)
  }
  return next.length === 0 ? badges : [...badges, ...next]
}

/**
 * Client-side XP/level curve for the squad progress surface.
 *
 * The host owns the authoritative `level` (folded in the `squadProgress`
 * projection). This module re-derives the same documented curve purely so the
 * UI can show progress *within* the current level without value-importing the
 * host package (whose `/client` outlet is type-only). The curve is
 * `level = floor(sqrt(xp / 10)) + 1`; a level `L` therefore starts at
 * `xp = 10 * (L - 1)^2`.
 *
 * @module @daoai/dao-client-ui-squad-progress/client/level-progress
 */

/**
 * XP at which a given 1-based level begins.
 * @param level - 1-based level whose lower edge is requested.
 * @returns cumulative XP at the level's lower edge.
 */
export function xpAtLevelStart(level: number): number {
  const prior = Math.max(1, level) - 1
  return 10 * prior * prior
}

/**
 * XP at which the level after a given 1-based level begins.
 * @param level - 1-based level whose upper edge is requested.
 * @returns cumulative XP at the next level's lower edge.
 */
export function xpAtLevelEnd(level: number): number {
  return xpAtLevelStart(level + 1)
}

/**
 * Fraction (0..1) of the way from the current level's start to the next.
 * Clamped to the band: a level is always at or past its own start and before
 * the next, so an out-of-band xp (host/curve drift) clamps rather than
 * overflows the bar.
 * @param xp - cumulative experience points.
 * @param level - 1-based level the xp belongs to.
 * @returns progress fraction in `[0, 1]`.
 */
export function levelProgress(xp: number, level: number): number {
  const start = xpAtLevelStart(level)
  const span = xpAtLevelEnd(level) - start
  if (span <= 0) return 0
  const fraction = (xp - start) / span
  return Math.min(1, Math.max(0, fraction))
}

/**
 * Whole XP still needed to reach the level after a given 1-based level.
 * The curve is unbounded, so this is the distance to the next band edge.
 * @param xp - cumulative experience points.
 * @param level - 1-based level the xp belongs to.
 * @returns non-negative whole XP remaining.
 */
export function xpToNextLevel(xp: number, level: number): number {
  return Math.max(0, Math.round(xpAtLevelEnd(level) - xp))
}

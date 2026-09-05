/**
 * Level curve for squad XP.
 *
 * @module @daoai/dao-squad-progress/level
 */

/**
 * Map cumulative XP to a 1-based level.
 * Curve: `level = floor(sqrt(xp / 10)) + 1` (documented in the Stage 6 Agent Note).
 * @param xp - non-negative experience points.
 * @returns the derived level (always ≥ 1).
 */
export function levelFromXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1
  return Math.floor(Math.sqrt(xp / 10)) + 1
}

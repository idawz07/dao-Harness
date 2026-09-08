/**
 * Strict positive-integer millisecond override for a snapshot timeout knob,
 * read from the environment (e.g. `DAO_SNAPSHOT_RECORD_TIMEOUT_MS`) and
 * falling back to the calling driver's own default when the variable is
 * unset or empty. Each driver keeps its normal margin as the fallback; the
 * override exists to widen record-mode margins on a contended farm router
 * without touching replay behavior. A non-integer or non-positive value
 * throws at driver load instead of silently shrinking the margin.
 *
 * @param name - environment variable holding the millisecond value
 * @param fallback - driver margin in milliseconds used when unset
 * @returns the millisecond margin to apply
 */
export function snapshotTimeoutMs(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback

  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`)
  }
  return value
}

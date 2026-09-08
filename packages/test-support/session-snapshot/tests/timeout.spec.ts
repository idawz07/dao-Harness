import { describe, expect, it } from 'vitest'
import { snapshotTimeoutMs } from '../src/timeout.ts'

describe('snapshotTimeoutMs', () => {
  it('returns fallback when variable is unset or empty', () => {
    delete process.env.TEST_SNAPSHOT_TIMEOUT_KNOB
    expect(snapshotTimeoutMs('TEST_SNAPSHOT_TIMEOUT_KNOB', 5000)).toBe(5000)

    process.env.TEST_SNAPSHOT_TIMEOUT_KNOB = ''
    expect(snapshotTimeoutMs('TEST_SNAPSHOT_TIMEOUT_KNOB', 5000)).toBe(5000)
    delete process.env.TEST_SNAPSHOT_TIMEOUT_KNOB
  })

  it('parses valid positive integer timeout', () => {
    process.env.TEST_SNAPSHOT_TIMEOUT_KNOB = '12000'
    expect(snapshotTimeoutMs('TEST_SNAPSHOT_TIMEOUT_KNOB', 5000)).toBe(12000)
    delete process.env.TEST_SNAPSHOT_TIMEOUT_KNOB
  })

  it('throws on non-integer or non-positive value', () => {
    process.env.TEST_SNAPSHOT_TIMEOUT_KNOB = '0'
    expect(() => snapshotTimeoutMs('TEST_SNAPSHOT_TIMEOUT_KNOB', 5000)).toThrow('TEST_SNAPSHOT_TIMEOUT_KNOB must be a positive integer')

    process.env.TEST_SNAPSHOT_TIMEOUT_KNOB = '-100'
    expect(() => snapshotTimeoutMs('TEST_SNAPSHOT_TIMEOUT_KNOB', 5000)).toThrow('TEST_SNAPSHOT_TIMEOUT_KNOB must be a positive integer')

    process.env.TEST_SNAPSHOT_TIMEOUT_KNOB = '1.5'
    expect(() => snapshotTimeoutMs('TEST_SNAPSHOT_TIMEOUT_KNOB', 5000)).toThrow('TEST_SNAPSHOT_TIMEOUT_KNOB must be a positive integer')

    process.env.TEST_SNAPSHOT_TIMEOUT_KNOB = 'not-a-number'
    expect(() => snapshotTimeoutMs('TEST_SNAPSHOT_TIMEOUT_KNOB', 5000)).toThrow('TEST_SNAPSHOT_TIMEOUT_KNOB must be a positive integer')
    delete process.env.TEST_SNAPSHOT_TIMEOUT_KNOB
  })
})

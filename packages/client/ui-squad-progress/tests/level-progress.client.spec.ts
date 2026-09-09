import { describe, expect, it } from 'vitest'
import {
  levelProgress, xpAtLevelEnd, xpAtLevelStart, xpToNextLevel,
} from '../src/client/level-progress.ts'

describe('xpAtLevelStart', () => {
  it('anchors level 1 at zero xp', () => {
    expect(xpAtLevelStart(1)).toBe(0)
  })

  it('follows the 10 * (L - 1)^2 curve', () => {
    expect(xpAtLevelStart(2)).toBe(10)
    expect(xpAtLevelStart(3)).toBe(40)
    expect(xpAtLevelStart(4)).toBe(90)
    expect(xpAtLevelStart(5)).toBe(160)
    expect(xpAtLevelStart(10)).toBe(810)
  })

  it('clamps sub-1 levels to the level-1 start', () => {
    expect(xpAtLevelStart(0)).toBe(0)
    expect(xpAtLevelStart(-3)).toBe(0)
  })
})

describe('xpAtLevelEnd', () => {
  it('is the next level start', () => {
    expect(xpAtLevelEnd(1)).toBe(10)
    expect(xpAtLevelEnd(2)).toBe(40)
    expect(xpAtLevelEnd(3)).toBe(90)
  })
})

describe('levelProgress', () => {
  it('starts a fresh level at zero', () => {
    expect(levelProgress(0, 1)).toBe(0)
    expect(levelProgress(10, 2)).toBe(0)
    expect(levelProgress(40, 3)).toBe(0)
  })

  it('reports the mid-band fraction', () => {
    expect(levelProgress(5, 1)).toBeCloseTo(0.5)
    expect(levelProgress(25, 2)).toBeCloseTo(0.5)
    expect(levelProgress(65, 3)).toBeCloseTo(0.5)
  })

  it('approaches one near the band edge', () => {
    expect(levelProgress(9, 1)).toBeCloseTo(0.9)
    expect(levelProgress(39, 2)).toBeCloseTo(0.9667)
  })

  it('clamps out-of-band xp to the unit interval', () => {
    expect(levelProgress(15, 1)).toBe(1)
    expect(levelProgress(5, 2)).toBe(0)
    expect(levelProgress(0, 0)).toBe(0)
  })
})

describe('xpToNextLevel', () => {
  it('counts the whole xp to the next edge', () => {
    expect(xpToNextLevel(0, 1)).toBe(10)
    expect(xpToNextLevel(5, 1)).toBe(5)
    expect(xpToNextLevel(10, 2)).toBe(30)
    expect(xpToNextLevel(25, 2)).toBe(15)
  })

  it('never goes negative past the edge', () => {
    expect(xpToNextLevel(12, 1)).toBe(0)
  })
})

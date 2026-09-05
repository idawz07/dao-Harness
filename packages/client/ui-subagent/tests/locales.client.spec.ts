/**
 * Locale keys for Stage 6 level/badge copy stay in the English dictionary.
 */

import { describe, expect, it } from 'vitest'
import { en } from '../src/client/locales.ts'

describe('subagent gamification locales', () => {
  it('owns level and badge copy keys', () => {
    expect(en['level.compact']).toBe('Lv.{level}')
    expect(en['level.title']).toBe('Level {level}')
    expect(en['badges.count']).toBe('{count} badges')
    expect(en['badges.count.one']).toBe('{count} badge')
    expect(en['badge.first_delegation']).toBe('First delegation')
    expect(en['badge.ten_tools']).toBe('Ten tools')
    expect(en['badge.error_free_turn']).toBe('Error-free turn')
  })
})

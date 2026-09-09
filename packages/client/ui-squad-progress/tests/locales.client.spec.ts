import { describe, expect, it } from 'vitest'
import type { SquadBadgeId } from '@daoai/dao-squad-progress/client'
import { BADGE_KEYS, en, NS } from '../src/client/locales.ts'

describe('squadProgress locale namespace', () => {
  it('owns the squadProgress namespace', () => {
    expect(NS).toBe('squadProgress')
  })

  it('maps every badge id to a badge.* key present in the dictionary', () => {
    const badges: readonly SquadBadgeId[] = ['first_delegation', 'ten_tools', 'error_free_turn']
    for (const badge of badges) {
      const key = BADGE_KEYS[badge]
      expect(key).toMatch(/^badge\./)
      expect(en[key]).toBeTruthy()
    }
  })

  it('covers exactly the closed badge id set', () => {
    expect(Object.keys(BADGE_KEYS).sort()).toEqual(['error_free_turn', 'first_delegation', 'ten_tools'])
  })
})

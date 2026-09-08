import { describe, expect, it } from 'vitest'
import { squadRoleFromLabel } from '../src/client/squad-role.ts'

describe('squadRoleFromLabel', () => {
  it('matches role-prefixed specialist labels', () => {
    expect(squadRoleFromLabel('Scout: API auth sources')).toBe('scout')
    expect(squadRoleFromLabel('Forge — fix login')).toBe('forge')
    expect(squadRoleFromLabel('lens review')).toBe('lens')
    expect(squadRoleFromLabel('Quill')).toBe('quill')
    expect(squadRoleFromLabel('relay bridge')).toBe('relay')
    expect(squadRoleFromLabel('scribe session')).toBe('scribe')
  })

  it('ignores ad-hoc subagent labels', () => {
    expect(squadRoleFromLabel('research helpers')).toBeUndefined()
    expect(squadRoleFromLabel('')).toBeUndefined()
    expect(squadRoleFromLabel('  ')).toBeUndefined()
  })
})

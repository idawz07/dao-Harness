import { Context } from '@daoai/cordis'
import InvariantRegistry from '@daoai/dao-invariants'
import { describe, expect, it } from 'vitest'
import * as StoreInvariant from '../src/invariant.ts'

describe('store invariant companion', () => {
  it('registers the package-owned empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })

    await expect(ctx.plugin(StoreInvariant).await()).resolves.toBeDefined()
  })
})

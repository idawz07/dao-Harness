import { describe, expect, it } from 'vitest'
import { Context } from '@daoai/cordis'
import * as GeneralInvariant from '@daoai/dao-client-ui-settings-general/invariant'
import InvariantRegistry from '@daoai/dao-invariants'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(GeneralInvariant).await()).resolves.toBeDefined()
  })
})

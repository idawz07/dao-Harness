import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@daoai/dao-invariants'
import { Context } from '@daoai/cordis'
import Storage, { storageBackendServiceKey } from '@daoai/dao-storage'
import * as StorageDomain from '@daoai/dao-storage-domain'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import ReferencesStore from '../src/index.ts'
import * as ReferencesInvariant from '../src/invariant.ts'

describe('references invariant companion', () => {
  it('removes its registry contribution when its fiber is disposed (HMR safety)', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(Storage)
      const backend = new MemoryStorageBackend()
      ctx.storage.backend.register('memory', backend)
      ctx.provide(storageBackendServiceKey('memory'), backend)
      await ctx.plugin(StorageDomain, { backend: 'memory' })
      await ctx.plugin(ReferencesStore)
      await ctx.plugin(InvariantRegistry)
      const fiber = await ctx.plugin(ReferencesInvariant)

      expect(() => {
        ctx.invariants.register('@daoai/dao-references', () => {})
      }).toThrow(/already registered/u)

      await fiber.dispose()
      await expect(ctx.plugin(ReferencesInvariant).await()).resolves.toBeDefined()
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

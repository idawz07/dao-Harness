import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@daoai/dao-invariants'
import { Context } from '@daoai/cordis'
import Storage, { storageBackendServiceKey } from '@daoai/dao-storage'
import * as StorageDomain from '@daoai/dao-storage-domain'
import SystemPrompt from '@daoai/dao-system-prompt'
import Tools from '@daoai/dao-tools'
import ReferencesStore from '@daoai/dao-references'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as ToolReferences from '../src/index.ts'
import * as ToolReferencesInvariant from '../src/invariant.ts'

describe('tool-references invariant companion', () => {
  it('removes its registry contribution when its fiber is disposed (HMR safety)', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(Storage)
      const backend = new MemoryStorageBackend()
      ctx.storage.backend.register('memory', backend)
      ctx.provide(storageBackendServiceKey('memory'), backend)
      await ctx.plugin(StorageDomain, { backend: 'memory' })
      await ctx.plugin(ReferencesStore)
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(Tools, { mode: 'native' })
      await ctx.plugin(ToolReferences)
      await ctx.plugin(InvariantRegistry)
      const fiber = await ctx.plugin(ToolReferencesInvariant)

      expect(() => {
        ctx.invariants.register('@daoai/dao-tool-references', () => {})
      }).toThrow(/already registered/u)

      await fiber.dispose()
      await expect(ctx.plugin(ToolReferencesInvariant).await()).resolves.toBeDefined()
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@daoai/cordis'
import Storage, { storageBackendServiceKey } from '@daoai/dao-storage'
import * as StorageDomain from '@daoai/dao-storage-domain'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import type { ChunkId as ChunkIdBrand } from '../src/types.ts'
import ReferencesStore, { DocumentId } from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

/** Boot the store over an in-memory storage-domain backend. */
async function setup(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend()
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  await ctx.plugin(StorageDomain, { backend: 'memory' })
  await ctx.plugin(ReferencesStore)
  return ctx
}

describe('ReferencesStore CRUD', () => {
  it('ingests text, lists, searches, gets, indexes, and removes', async () => {
    const ctx = await setup()
    const documentId = await ctx.references.addFromText({
      title: 'Guide',
      source: { kind: 'path', value: '/tmp/guide.md' },
      text: 'alpha beta gamma alpha',
    })
    expect(documentId).toMatch(/^[0-9a-f-]{36}$/iu)

    const listed = ctx.references.list()
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      id: documentId,
      title: 'Guide',
      source: { kind: 'path', value: '/tmp/guide.md' },
      chunkCount: 1,
    })

    const hits = ctx.references.search({ query: 'alpha' })
    expect(hits.length).toBe(1)
    expect(hits[0]?.documentId).toBe(documentId)
    expect(hits[0]?.score).toBeGreaterThan(0)

    const document = ctx.references.get({ documentId })
    expect(document).toMatchObject({ id: documentId, title: 'Guide' })
    const chunkId = (document as { chunkIds: readonly ChunkIdBrand[] }).chunkIds[0]!
    const chunk = ctx.references.get({ chunkId })
    expect(chunk).toMatchObject({ id: chunkId, documentId, index: 0 })

    const index = ctx.references.index()
    expect(index.sources).toHaveLength(1)
    expect(index.sources[0]?.documents[0]?.chunks[0]?.preview).toContain('alpha')

    await ctx.references.remove({ documentId })
    expect(ctx.references.list()).toEqual([])
    expect(() => ctx.references.get({ documentId: DocumentId(documentId) }))
      .toThrow(/not found/)
  })

  it('rejects get without exactly one id selector', async () => {
    const ctx = await setup()
    expect(() => ctx.references.get({})).toThrow(/exactly one/)
  })
})

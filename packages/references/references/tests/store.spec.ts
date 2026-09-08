import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@daoai/cordis'
import Storage, { storageBackendServiceKey } from '@daoai/dao-storage'
import * as StorageDomain from '@daoai/dao-storage-domain'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import type { ChunkId as ChunkIdBrand } from '../src/types.ts'
import ReferencesStore, {
  ChunkId,
  DocumentId,
  referenceChunkSchema,
  referenceDocumentSchema,
  referenceSourceSchema,
} from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

/** Boot the store over an in-memory storage-domain backend. */
async function setup(): Promise<{ ctx: Context; backend: MemoryStorageBackend }> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend()
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  await ctx.plugin(StorageDomain, { backend: 'memory' })
  await ctx.plugin(ReferencesStore)
  return { ctx, backend }
}

describe('ReferencesStore CRUD', () => {
  it('ingests text, lists, searches, gets, indexes, and removes', async () => {
    const { ctx } = await setup()
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

  it('rejects get without exactly one id selector or with unknown ids', async () => {
    const { ctx } = await setup()
    expect(() => ctx.references.get({})).toThrow(/exactly one/)
    expect(() => ctx.references.get({
      documentId: DocumentId('d1'),
      chunkId: ChunkId('c1'),
    })).toThrow(/exactly one/)
    expect(() => ctx.references.get({ documentId: DocumentId('missing-doc') }))
      .toThrow(/document 'missing-doc' not found/)
    expect(() => ctx.references.get({ chunkId: ChunkId('missing-chunk') }))
      .toThrow(/chunk 'missing-chunk' not found/)
  })

  it('validates addFromText arguments', async () => {
    const { ctx } = await setup()
    await expect(ctx.references.addFromText({
      title: '   ',
      source: { kind: 'path', value: '/tmp/test' },
      text: 'body',
    })).rejects.toThrow(/title must be a non-empty string/)

    await expect(ctx.references.addFromText({
      title: 'Valid',
      source: { kind: 'path', value: '   ' },
      text: 'body',
    })).rejects.toThrow(/source value must be a non-empty string/)
  })

  it('handles addFromPath with and without ctx.fs', async () => {
    const { ctx } = await setup()
    await expect(ctx.references.addFromPath({ path: '  ' }))
      .rejects.toThrow(/path must be a non-empty string/)

    const dir = await mkdtemp(join(tmpdir(), 'dao-ref-test-'))
    const filePath = join(dir, 'doc.txt')
    await writeFile(filePath, 'content from real fs')
    try {
      const docId = await ctx.references.addFromPath({ path: filePath })
      expect(ctx.references.get({ documentId: docId })).toMatchObject({
        title: 'doc.txt',
        source: { kind: 'path', value: filePath },
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }

    ctx.provide('fs', {
      resolve: async (p: string) => ({ targetKey: p, displayPath: p }),
      readText: async () => 'content from ctx.fs',
    })
    const mockDocId = await ctx.references.addFromPath({ path: '/virtual/path.txt' })
    expect(ctx.references.get({ documentId: mockDocId })).toMatchObject({
      title: 'path.txt',
      source: { kind: 'path', value: '/virtual/path.txt' },
    })
  })

  it('handles addFromUrl with and without ctx.web', async () => {
    const { ctx } = await setup()
    await expect(ctx.references.addFromUrl({ url: '  ' }))
      .rejects.toThrow(/url must be a non-empty string/)

    await expect(ctx.references.addFromUrl({ url: 'https://example.com' }))
      .rejects.toThrow(/addFromUrl requires ctx.web/)

    ctx.provide('web', {
      fetch: async (req: { url: string }) => ({
        body: { kind: 'text', content: `fetched body for ${req.url}` },
      }),
    })
    const docId = await ctx.references.addFromUrl({ url: 'https://example.com' })
    expect(ctx.references.get({ documentId: docId })).toMatchObject({
      title: 'https://example.com',
      source: { kind: 'url', value: 'https://example.com' },
    })
  })

  it('validates search and orders hits', async () => {
    const { ctx } = await setup()
    expect(() => ctx.references.search({ query: '   ' }))
      .toThrow(/query must be a non-empty string/)
    expect(() => ctx.references.search({ query: 'ok', topK: 0 }))
      .toThrow(/topK must be a positive safe integer/)
    expect(() => ctx.references.search({ query: 'ok', topK: -5 }))
      .toThrow(/topK must be a positive safe integer/)

    const d1 = await ctx.references.addFromText({
      title: 'Doc 1',
      source: { kind: 'path', value: '/a/doc1' },
      text: 'common keyword once',
    })
    const d2 = await ctx.references.addFromText({
      title: 'Doc 2',
      source: { kind: 'url', value: 'https://b.test' },
      text: 'common keyword common keyword common',
    })

    const hits = ctx.references.search({ query: 'common', topK: 5 })
    expect(hits.length).toBe(2)
    expect(hits[0]?.documentId).toBe(d2)
    expect(hits[1]?.documentId).toBe(d1)
    expect(ctx.references.search({ query: 'nonexistent' })).toEqual([])

    // Tie-breaking chunkId sort when scores are equal
    const tie1 = await ctx.references.addFromText({
      title: 'Tie 1',
      source: { kind: 'path', value: '/tie/1' },
      text: 'tiebreaker alpha match',
    })
    const tie2 = await ctx.references.addFromText({
      title: 'Tie 2',
      source: { kind: 'path', value: '/tie/2' },
      text: 'tiebreaker alpha match',
    })
    const tieHits = ctx.references.search({ query: 'tiebreaker' })
    expect(tieHits.length).toBe(2)
    expect(tieHits[0]?.score).toBe(tieHits[1]?.score)
    expect(tieHits.map(h => h.documentId).sort()).toEqual([tie1, tie2].sort())
  })

  it('indexes multiple sources, shared sources, and sorts correctly', async () => {
    const { ctx } = await setup()
    // Shared source between two docs
    await ctx.references.addFromText({
      title: 'File 1',
      source: { kind: 'path', value: '/repo/dir' },
      text: 'content a',
    })
    await ctx.references.addFromText({
      title: 'File 2',
      source: { kind: 'path', value: '/repo/dir' },
      text: 'content b',
    })
    // Different path value
    await ctx.references.addFromText({
      title: 'File 3',
      source: { kind: 'path', value: '/repo/other' },
      text: 'content c',
    })
    // Different kind (url)
    await ctx.references.addFromText({
      title: 'URL Doc',
      source: { kind: 'url', value: 'https://example.com' },
      text: 'content d',
    })

    const index = ctx.references.index()
    expect(index.sources.length).toBe(3)
    // path comes before url in sort
    expect(index.sources[0]?.kind).toBe('path')
    expect(index.sources[0]?.value).toBe('/repo/dir')
    expect(index.sources[0]?.documents.length).toBe(2)
    expect(index.sources[1]?.value).toBe('/repo/other')
    expect(index.sources[2]?.kind).toBe('url')
  })

  it('handles corrupted references in search and index', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(Storage)
    const backend = new MemoryStorageBackend()
    ctx.storage.backend.register('memory', backend)
    ctx.provide(storageBackendServiceKey('memory'), backend)

    const medium = {
      tables: new Map<string, Map<string, unknown>>([
        ['documents', new Map([
          ['doc-with-missing-chunk', {
            id: 'doc-with-missing-chunk',
            title: 'Bad Doc',
            source: { kind: 'path', value: '/tmp/bad' },
            ingestedAt: 100,
            chunkIds: ['missing-chunk-id'],
          }],
        ])],
        ['chunks', new Map([
          ['orphan-chunk', {
            id: 'orphan-chunk',
            documentId: 'nonexistent-doc',
            index: 0,
            text: 'corrupt search keyword',
            hash: '1234',
          }],
        ])],
      ]),
      global: null,
    }
    backend.pool.media.set('references', medium)

    await ctx.plugin(StorageDomain, { backend: 'memory' })
    await ctx.plugin(ReferencesStore)

    expect(() => ctx.references.search({ query: 'corrupt' }))
      .toThrow(/references missing document/)
    expect(() => ctx.references.index())
      .toThrow(/references missing chunk/)
  })

  it('rejects remove for missing document', async () => {
    const { ctx } = await setup()
    await expect(ctx.references.remove({ documentId: DocumentId('nope') }))
      .rejects.toThrow(/document 'nope' not found/)
  })

  it('parses schemas in spec.ts', () => {
    const doc = referenceDocumentSchema.parse({
      id: 'd1',
      title: 'T',
      source: { kind: 'path', value: '/path' },
      ingestedAt: 50,
      chunkIds: ['c1'],
    })
    expect(doc.id).toBe('d1')
    expect(doc.chunkIds).toEqual(['c1'])

    const urlDoc = referenceDocumentSchema.parse({
      id: 'd2',
      title: 'T2',
      source: { kind: 'url', value: 'https://example.com' },
      ingestedAt: 60,
      chunkIds: [],
    })
    expect(urlDoc.source.kind).toBe('url')

    const chunk = referenceChunkSchema.parse({
      id: 'c1',
      documentId: 'd1',
      index: 0,
      text: 'content',
      hash: '123',
    })
    expect(chunk.id).toBe('c1')
    expect(chunk.documentId).toBe('d1')

    const src = referenceSourceSchema.parse({ kind: 'url', value: 'http://foo' })
    expect(src.kind).toBe('url')
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@daoai/cordis'
import Storage, { storageBackendServiceKey } from '@daoai/dao-storage'
import * as StorageDomain from '@daoai/dao-storage-domain'
import SystemPrompt from '@daoai/dao-system-prompt'
import Tools from '@daoai/dao-tools'
import { ToolCallId } from '@daoai/dao-llm'
import ReferencesStore from '@daoai/dao-references'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as ToolReferences from '../src/index.ts'

const contexts: Context[] = []

const textOf = (res: { content: readonly unknown[] }): string =>
  (res.content[0] as { type: string; text?: string })?.text ?? ''

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function setup(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend()
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  await ctx.plugin(StorageDomain, { backend: 'memory' })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(Tools, { mode: 'native' })
  await ctx.plugin(ReferencesStore)
  await ctx.plugin(ToolReferences)
  return ctx
}

describe('ToolReferences model tools', () => {
  it('registers system prompt section', async () => {
    const ctx = await setup()
    const assembly = await ctx.systemPrompt.assemble()
    const section = assembly.sections.find(s => s.name === 'tool:references')
    expect(section?.text).toContain('Use the reference_* tools')
  })

  it('exercises reference_add validation, presentCall, and execution modes', async () => {
    const ctx = await setup()
    const tool = ctx.tools.get('reference_add')!
    expect(tool).toBeDefined()

    // presentCall variants
    expect(tool.presentCall?.({ path: '/foo/bar.txt' })).toMatchObject({
      title: 'Reference add /foo/bar.txt',
      kind: 'read',
      locations: [{ path: '/foo/bar.txt' }],
    })
    expect(tool.presentCall?.({ url: 'https://example.com' })).toMatchObject({
      title: 'Reference add https://example.com',
      kind: 'search',
      rawInput: 'https://example.com',
    })
    expect(tool.presentCall?.({ title: 'My Title', text: 'body' })).toMatchObject({
      title: 'Reference add My Title',
      kind: 'read',
    })
    expect(tool.presentCall?.({ text: 'only text' })).toMatchObject({
      title: 'Reference add text',
      kind: 'read',
    })

    // render output
    const rendered = tool.output.render({}, { documentId: 'doc-123' })
    expect(rendered).toEqual([{ type: 'text', text: 'Ingested document doc-123' }])

    // execute validation: countAddModes !== 1
    const call0 = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('c0'),
      name: 'reference_add',
      arguments: {},
    })
    expect(call0.isError).toBe(true)
    expect(textOf(call0)).toContain('provide exactly one of path, url, or {title, text}')

    const callMulti = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('c-multi'),
      name: 'reference_add',
      arguments: { path: '/tmp/test', url: 'https://example.com' },
    })
    expect(callMulti.isError).toBe(true)

    // missing title or text in text mode
    const callMissingText = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('c-notext'),
      name: 'reference_add',
      arguments: { title: 'Title only' },
    })
    expect(callMissingText.isError).toBe(true)
    expect(textOf(callMissingText)).toContain('title and text are both required')

    // execute via path with ctx.fs
    ctx.provide('fs', {
      resolve: async (p: string) => ({ targetKey: p, displayPath: p }),
      readText: async () => 'path content',
    })
    const callPath = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('c-path'),
      name: 'reference_add',
      arguments: { path: '/virtual/file.md' },
    })
    expect(callPath.isError).toBe(false)

    // execute via url with ctx.web
    ctx.provide('web', {
      fetch: async () => ({ body: { kind: 'text', content: 'web content' } }),
    })
    const callUrl = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('c-url'),
      name: 'reference_add',
      arguments: { url: 'https://dao.ai/docs' },
    })
    expect(callUrl.isError).toBe(false)

    // execute via text
    const callText = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('c-text'),
      name: 'reference_add',
      arguments: { title: 'Article', text: 'article content with keywords' },
    })
    expect(callText.isError).toBe(false)
  })

  it('exercises reference_search, reference_list, reference_index, reference_get, and reference_remove', async () => {
    const ctx = await setup()

    const searchTool = ctx.tools.get('reference_search')!
    expect(searchTool.presentCall?.({ query: 'test' })).toMatchObject({
      title: 'Reference search test',
      kind: 'search',
      rawInput: 'test',
    })
    expect(searchTool.output.render({}, 'search output')).toEqual([{ type: 'text', text: 'search output' }])

    const listTool = ctx.tools.get('reference_list')!
    expect(listTool.presentCall?.({})).toMatchObject({
      title: 'Reference list',
      kind: 'search',
    })

    const indexTool = ctx.tools.get('reference_index')!
    expect(indexTool.presentCall?.({})).toMatchObject({
      title: 'Reference index',
      kind: 'search',
    })

    const getTool = ctx.tools.get('reference_get')!
    expect(searchTool.isConcurrencySafe?.({ query: 'test' })).toBe(true)
    expect(listTool.isConcurrencySafe?.({})).toBe(true)
    expect(indexTool.isConcurrencySafe?.({})).toBe(true)
    expect(getTool.isConcurrencySafe?.({ document_id: 'd1' })).toBe(true)
    expect(getTool.presentCall?.({})).toMatchObject({
      title: 'Reference get chunk ',
      kind: 'read',
    })
    expect(getTool.presentCall?.({ document_id: 'd1' })).toMatchObject({
      title: 'Reference get document d1',
      kind: 'read',
    })
    expect(getTool.presentCall?.({ chunk_id: 'c1' })).toMatchObject({
      title: 'Reference get chunk c1',
      kind: 'read',
    })

    const removeTool = ctx.tools.get('reference_remove')!
    expect(removeTool.presentCall?.({ document_id: 'd1' })).toMatchObject({
      title: 'Reference remove d1',
      kind: 'delete',
    })
    expect(removeTool.output.render({}, { removed: true, documentId: 'd1' })).toEqual([
      { type: 'text', text: 'Removed document d1' },
    ])

    // When empty
    const emptySearch = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('s-empty'),
      name: 'reference_search',
      arguments: { query: 'nothing' },
    })
    expect(textOf(emptySearch)).toBe('No reference hits.')

    const emptyList = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('l-empty'),
      name: 'reference_list',
      arguments: {},
    })
    expect(textOf(emptyList)).toBe('No reference documents.')

    const emptyIndex = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('i-empty'),
      name: 'reference_index',
      arguments: {},
    })
    expect(textOf(emptyIndex)).toBe('Reference index is empty.')

    // Add a document
    const docId = await ctx.references.addFromText({
      title: 'Handbook',
      source: { kind: 'path', value: '/docs/handbook.txt' },
      text: 'searchable keyword in first paragraph',
    })
    const doc = ctx.references.get({ documentId: docId }) as { chunkIds: readonly string[] }
    const chunkId = doc.chunkIds[0]!

    // Search with hits
    const hitSearch = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('s-hit'),
      name: 'reference_search',
      arguments: { query: 'keyword', top_k: 3 },
    })
    expect(textOf(hitSearch)).toContain('score=')
    expect(textOf(hitSearch)).toContain('Handbook')

    // List with items
    const populatedList = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('l-pop'),
      name: 'reference_list',
      arguments: {},
    })
    expect(textOf(populatedList)).toContain('Handbook')
    expect(textOf(populatedList)).toContain('chunks=1')

    // Index with items
    const populatedIndex = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('i-pop'),
      name: 'reference_index',
      arguments: {},
    })
    expect(textOf(populatedIndex)).toContain('path:/docs/handbook.txt')
    expect(textOf(populatedIndex)).toContain('Handbook')

    // Get validation: neither or both
    const badGet1 = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('g-bad1'),
      name: 'reference_get',
      arguments: {},
    })
    expect(badGet1.isError).toBe(true)

    const badGet2 = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('g-bad2'),
      name: 'reference_get',
      arguments: { document_id: docId, chunk_id: chunkId },
    })
    expect(badGet2.isError).toBe(true)

    // Get document
    const getDoc = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('g-doc'),
      name: 'reference_get',
      arguments: { document_id: docId },
    })
    expect(getDoc.isError).toBe(false)
    expect(textOf(getDoc)).toContain(`documentId=${docId}`)
    expect(textOf(getDoc)).toContain('title=Handbook')

    // Get chunk
    const getChunk = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('g-chunk'),
      name: 'reference_get',
      arguments: { chunk_id: chunkId },
    })
    expect(getChunk.isError).toBe(false)
    expect(textOf(getChunk)).toContain(`chunkId=${chunkId}`)
    expect(textOf(getChunk)).toContain('searchable keyword')

    // Remove
    const removeResult = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('r-rem'),
      name: 'reference_remove',
      arguments: { document_id: docId },
    })
    expect(removeResult.isError).toBe(false)
    expect(ctx.references.list()).toHaveLength(0)
  })
})

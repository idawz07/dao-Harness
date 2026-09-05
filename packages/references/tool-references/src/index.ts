/**
 * Model-facing tools over `ctx.references`.
 * @module @daoai/dao-tool-references
 */

import type { Context } from '@daoai/cordis'
import { ChunkId, DocumentId } from '@daoai/dao-references'
import type { ReferenceChunk, ReferenceDocument } from '@daoai/dao-references'
import { defineTool } from '@daoai/dao-tools'
import type { GenericCallView } from '@daoai/dao-tools'
import { FIRST_PARTY_SECTION_ORDER } from '@daoai/dao-system-prompt'

/** Cordis plugin name. */
export const name = 'tool-references'

/** Services required to register tools and guidance. */
export const inject = ['tools', 'references', 'systemPrompt']

const PROMPT_TEXT =
  'Use the reference_* tools to ingest durable source material into the reference store, '
  + 'search it by keyword, fetch a document or chunk, list holdings, remove stale entries, '
  + 'and navigate the index (sources → documents → chunk previews). Prefer ingesting with '
  + 'reference_add (path, url, or title+text) when the squad will need the material later; '
  + 'use reference_search before re-reading large sources you already stored.'

const TEXT_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

/**
 * Register the six reference tools and shared system-prompt guidance.
 * @param ctx - context carrying tools, references, and systemPrompt.
 */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'tool:references',
    order: FIRST_PARTY_SECTION_ORDER.TOOL_REFERENCES,
    text: PROMPT_TEXT,
  })

  ctx.tools.register(defineTool({
    name: 'reference_add',
    description:
      'Ingest one reference into the durable store. Provide exactly one of: path, url, '
      + 'or both title and text.',
    parameters: {
      path: { type: 'string', description: 'Local filesystem path to read and ingest.' },
      url: { type: 'string', description: 'HTTP(S) URL to fetch and ingest (requires web).' },
      title: { type: 'string', description: 'Document title when ingesting raw text.' },
      text: { type: 'string', description: 'Document body when ingesting raw text.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          documentId: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Ingested document ${value.documentId}` }],
    },
    presentCall: presentAddCall,
    async execute(args) {
      const modes = countAddModes(args)
      if (modes !== 1) {
        throw new Error('reference_add: provide exactly one of path, url, or {title, text}')
      }
      if (args.path !== undefined) {
        const documentId = await ctx.references.addFromPath({ path: args.path })
        return { documentId }
      }
      if (args.url !== undefined) {
        const documentId = await ctx.references.addFromUrl({ url: args.url })
        return { documentId }
      }
      const title = args.title
      const text = args.text
      if (title === undefined || text === undefined) {
        throw new Error('reference_add: title and text are both required for text ingest')
      }
      const documentId = await ctx.references.addFromText({
        title,
        source: { kind: 'path', value: 'inline' },
        text,
      })
      return { documentId }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'reference_search',
    description: 'Keyword-search ingested reference chunks and return the strongest hits.',
    parameters: {
      query: { type: 'string', required: true, description: 'Keyword query.' },
      top_k: { type: 'integer', description: 'Maximum hits to return (default 5).' },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    presentCall: args => ({
      card: 'generic',
      title: `Reference search ${args.query}`,
      kind: 'search',
      rawInput: args.query,
    }),
    execute(args) {
      const hits = ctx.references.search({
        query: args.query,
        ...(args.top_k === undefined ? {} : { topK: args.top_k }),
      })
      if (hits.length === 0) return Promise.resolve('No reference hits.')
      return Promise.resolve(hits.map(hit =>
        [
          `score=${hit.score.toFixed(4)} chunk=${hit.chunkId} doc=${hit.documentId}`,
          `title=${hit.title}`,
          `source=${hit.source.kind}:${hit.source.value}`,
          hit.text,
        ].join('\n')).join('\n\n'))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'reference_get',
    description: 'Fetch one full reference document or one chunk by id.',
    parameters: {
      document_id: { type: 'string', description: 'Document id to fetch.' },
      chunk_id: { type: 'string', description: 'Chunk id to fetch.' },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    presentCall: args => ({
      card: 'generic',
      title: args.document_id !== undefined
        ? `Reference get document ${args.document_id}`
        : `Reference get chunk ${args.chunk_id ?? ''}`,
      kind: 'read',
    }),
    execute(args) {
      const hasDocument = args.document_id !== undefined
      const hasChunk = args.chunk_id !== undefined
      if (hasDocument === hasChunk) {
        return Promise.reject(new Error('reference_get: provide exactly one of document_id or chunk_id'))
      }
      if (args.document_id !== undefined) {
        return Promise.resolve(
          formatDocument(ctx.references.get({ documentId: DocumentId(args.document_id) }) as ReferenceDocument),
        )
      }
      const chunkId = args.chunk_id
      if (chunkId === undefined) {
        return Promise.reject(new Error('reference_get: provide exactly one of document_id or chunk_id'))
      }
      return Promise.resolve(
        formatChunk(ctx.references.get({ chunkId: ChunkId(chunkId) }) as ReferenceChunk),
      )
    },
  }))

  ctx.tools.register(defineTool({
    name: 'reference_list',
    description: 'List ingested reference documents (id, title, source, chunk count).',
    parameters: {},
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    presentCall: () => ({ card: 'generic', title: 'Reference list', kind: 'search' }),
    execute() {
      const rows = ctx.references.list()
      if (rows.length === 0) return Promise.resolve('No reference documents.')
      return Promise.resolve(rows.map(row =>
        `${row.id}\t${row.title}\t${row.source.kind}:${row.source.value}\tchunks=${row.chunkCount}`).join('\n'))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'reference_remove',
    description: 'Delete one reference document and all of its chunks.',
    parameters: {
      document_id: { type: 'string', required: true, description: 'Document id to remove.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          removed: { type: 'boolean', required: true },
          documentId: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Removed document ${value.documentId}` }],
    },
    presentCall: args => ({
      card: 'generic',
      title: `Reference remove ${args.document_id}`,
      kind: 'delete',
    }),
    async execute(args) {
      await ctx.references.remove({ documentId: DocumentId(args.document_id) })
      return { removed: true, documentId: args.document_id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'reference_index',
    description: 'Navigate the reference store: sources → documents → chunk previews.',
    parameters: {},
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    presentCall: () => ({ card: 'generic', title: 'Reference index', kind: 'search' }),
    execute() {
      const index = ctx.references.index()
      if (index.sources.length === 0) return Promise.resolve('Reference index is empty.')
      const lines: string[] = []
      for (const source of index.sources) {
        lines.push(`${source.kind}:${source.value}`)
        for (const document of source.documents) {
          lines.push(`  ${document.id} — ${document.title}`)
          for (const chunk of document.chunks) {
            lines.push(`    [${chunk.index}] ${chunk.id}: ${chunk.preview}`)
          }
        }
      }
      return Promise.resolve(lines.join('\n'))
    },
  }))
}

/** Count mutually exclusive add modes present on the args object. */
function countAddModes(args: {
  path?: string
  url?: string
  title?: string
  text?: string
}): number {
  let count = 0
  if (args.path !== undefined) count += 1
  if (args.url !== undefined) count += 1
  if (args.title !== undefined || args.text !== undefined) count += 1
  return count
}

/** Pending card for reference_add. */
function presentAddCall(args: {
  path?: string
  url?: string
  title?: string
  text?: string
}): GenericCallView {
  if (args.path !== undefined) {
    return { card: 'generic', title: `Reference add ${args.path}`, kind: 'read', locations: [{ path: args.path }] }
  }
  if (args.url !== undefined) {
    return { card: 'generic', title: `Reference add ${args.url}`, kind: 'search', rawInput: args.url }
  }
  return { card: 'generic', title: `Reference add ${args.title ?? 'text'}`, kind: 'read' }
}

/** Format a document row for model text. */
function formatDocument(document: ReferenceDocument): string {
  return [
    `documentId=${document.id}`,
    `title=${document.title}`,
    `source=${document.source.kind}:${document.source.value}`,
    `ingestedAt=${document.ingestedAt}`,
    `chunkIds=${document.chunkIds.join(',')}`,
  ].join('\n')
}

/** Format a chunk row for model text. */
function formatChunk(chunk: ReferenceChunk): string {
  return [
    `chunkId=${chunk.id}`,
    `documentId=${chunk.documentId}`,
    `index=${chunk.index}`,
    `hash=${chunk.hash}`,
    chunk.text,
  ].join('\n')
}

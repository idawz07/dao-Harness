/**
 * Storage-domain document store for ingested reference material.
 * @module @daoai/dao-references
 */

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Context, Service } from '@daoai/cordis'
import type { KvTable } from '@daoai/dao-storage-domain'
import { chunkPreview, chunkText, hashChunkText } from './chunk.ts'
import { scoreChunk } from './search.ts'
import { referencesDomainSpec } from './spec.ts'
import type {
  AddFromPathRequest,
  AddFromTextRequest,
  AddFromUrlRequest,
  ChunkId,
  DocumentId,
  ReferenceChunk,
  ReferenceDocument,
  ReferenceDocumentSummary,
  ReferenceGetRequest,
  ReferenceIndex,
  ReferenceIndexDocument,
  ReferenceIndexSource,
  ReferenceRemoveRequest,
  ReferenceSearchHit,
  ReferenceSearchRequest,
  ReferenceSource,
} from './types.ts'

export type * from './types.ts'
export {
  CHUNK_CHAR_OVERLAP,
  CHUNK_CHAR_SIZE,
  chunkPreview,
  chunkText,
  hashChunkText,
} from './chunk.ts'
export { scoreChunk, tokenize } from './search.ts'
export {
  referenceChunkSchema,
  referenceDocumentSchema,
  referenceSourceSchema,
  referencesDomainSpec,
} from './spec.ts'

/** Default number of keyword hits returned by {@link ReferencesStore.search}. */
export const DEFAULT_SEARCH_TOP_K = 5

declare module '@daoai/cordis' {
  interface Context {
    references: ReferencesStore
  }
}

/**
 * Brand a string as a {@link DocumentId}.
 *
 * @param id - Plain string document identifier.
 * @returns Branded document identifier.
 */
export function DocumentId(id: string): DocumentId {
  return id as DocumentId
}

/**
 * Brand a string as a {@link ChunkId}.
 *
 * @param id - Plain string chunk identifier.
 * @returns Branded chunk identifier.
 */
export function ChunkId(id: string): ChunkId {
  return id as ChunkId
}

/** Minimal filesystem surface used when `ctx.fs` is mounted. */
interface FsReader {
  resolve(path: string, opts?: { cwd?: string }): Promise<{ targetKey: string; displayPath: string }>
  readText(target: { targetKey: string; displayPath: string }, signal?: AbortSignal): Promise<string>
}

/** Minimal web fetch surface used when `ctx.web` is mounted. */
interface WebFetcher {
  fetch(request: { url: string }, signal?: AbortSignal): Promise<{
    body: { kind: 'html' | 'text'; content: string }
  }>
}

/**
 * Singular Store service over the `references` storage domain.
 * Opens the domain in {@link Service.init} and closes it on dispose.
 */
export class ReferencesStore extends Service {
  static inject = ['storageDomain']

  private documents?: KvTable<DocumentId, ReferenceDocument>
  private chunks?: KvTable<ChunkId, ReferenceChunk>

  /**
   * @param ctx - Host context carrying the storage-domain form.
   */
  constructor(ctx: Context) {
    super(ctx, 'references')
  }

  /** Open and own the one references domain. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(referencesDomainSpec)
    this.ctx.effect(() => async () => {
      await domain.close()
    }, 'references.domainClose')
    this.documents = domain.table('documents')
    this.chunks = domain.table('chunks')
  }

  /**
   * Ingest plain text: chunk, hash, and persist a new document.
   * @param request - title, source, and body text.
   * @returns the new document id.
   */
  async addFromText(request: AddFromTextRequest): Promise<DocumentId> {
    const title = request.title.trim()
    if (title.length === 0) {
      throw new Error('references: title must be a non-empty string')
    }
    const source = freezeSource(request.source)
    const documentId = DocumentId(randomUUID())
    const parts = chunkText(request.text)
    const chunkIds: ChunkId[] = []
    const chunkRows: ReferenceChunk[] = []
    for (const [index, text] of parts.entries()) {
      const id = ChunkId(randomUUID())
      chunkIds.push(id)
      chunkRows.push(Object.freeze({
        id,
        documentId,
        index,
        text,
        hash: hashChunkText(text),
      }))
    }
    const document = Object.freeze({
      id: documentId,
      title,
      source,
      ingestedAt: Date.now(),
      chunkIds: Object.freeze([...chunkIds]),
    })
    const documents = this.requireDocuments()
    const chunks = this.requireChunks()
    for (const row of chunkRows) {
      await chunks.put(row.id, row)
    }
    await documents.put(documentId, document)
    return documentId
  }

  /**
   * Read a local path via `ctx.fs` when present, otherwise `node:fs/promises`,
   * then ingest with the basename as title and a path source.
   * @param request - filesystem path.
   * @returns the new document id.
   */
  async addFromPath(request: AddFromPathRequest): Promise<DocumentId> {
    const path = request.path.trim()
    if (path.length === 0) {
      throw new Error('references: path must be a non-empty string')
    }
    const text = await this.readPathText(path)
    return this.addFromText({
      title: basename(path),
      source: { kind: 'path', value: path },
      text,
    })
  }

  /**
   * Fetch a URL via `ctx.web.fetch` and ingest the decoded body.
   * Fails loud when the web service is not mounted.
   * @param request - absolute URL.
   * @returns the new document id.
   */
  async addFromUrl(request: AddFromUrlRequest): Promise<DocumentId> {
    const url = request.url.trim()
    if (url.length === 0) {
      throw new Error('references: url must be a non-empty string')
    }
    const web = this.ctx.get('web') as WebFetcher | undefined
    if (web === undefined) {
      throw new Error('references: addFromUrl requires ctx.web (mount @daoai/dao-web and a fetch provider)')
    }
    const result = await web.fetch({ url })
    return this.addFromText({
      title: url,
      source: { kind: 'url', value: url },
      text: result.body.content,
    })
  }

  /**
   * Keyword search over chunk text, returning the top scoring hits with
   * document metadata.
   * @param request - query and optional hit cap.
   * @returns hits ordered by descending score (stable by chunk id on ties).
   */
  search(request: ReferenceSearchRequest): readonly ReferenceSearchHit[] {
    const query = request.query.trim()
    if (query.length === 0) {
      throw new Error('references: query must be a non-empty string')
    }
    const topK = resolveTopK(request.topK)
    const documents = this.requireDocuments()
    const chunks = this.requireChunks()
    const hits: ReferenceSearchHit[] = []
    for (const [, chunk] of chunks.entries()) {
      const score = scoreChunk(query, chunk.text)
      if (score <= 0) continue
      const document = documents.get(chunk.documentId)
      if (document === undefined) {
        throw new Error(`references: chunk '${chunk.id}' references missing document '${chunk.documentId}'`)
      }
      hits.push(Object.freeze({
        chunkId: chunk.id,
        documentId: document.id,
        title: document.title,
        source: document.source,
        index: chunk.index,
        text: chunk.text,
        score,
      }))
    }
    hits.sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId))
    return Object.freeze(hits.slice(0, topK).map(hit => Object.freeze({ ...hit })))
  }

  /**
   * Return one full document or one full chunk.
   * Exactly one of `documentId` or `chunkId` must be set.
   * @param request - document or chunk identity.
   * @returns the stored row.
   */
  get(request: ReferenceGetRequest): ReferenceDocument | ReferenceChunk {
    const hasDocument = request.documentId !== undefined
    const hasChunk = request.chunkId !== undefined
    if (hasDocument === hasChunk) {
      throw new Error('references: get requires exactly one of documentId or chunkId')
    }
    if (request.documentId !== undefined) {
      const document = this.requireDocuments().get(request.documentId)
      if (document === undefined) {
        throw new Error(`references: document '${request.documentId}' not found`)
      }
      return document
    }
    const chunkId = request.chunkId
    /* v8 ignore next 3 -- TypeScript narrowing: hasDocument === hasChunk above guarantees chunkId is defined */
    if (chunkId === undefined) {
      throw new Error('references: get requires exactly one of documentId or chunkId')
    }
    const chunk = this.requireChunks().get(chunkId)
    if (chunk === undefined) {
      throw new Error(`references: chunk '${chunkId}' not found`)
    }
    return chunk
  }

  /**
   * List document summaries in ingestion order of discovery (table iteration).
   * @returns immutable summaries.
   */
  list(): readonly ReferenceDocumentSummary[] {
    const summaries: ReferenceDocumentSummary[] = []
    for (const [, document] of this.requireDocuments().entries()) {
      summaries.push(Object.freeze({
        id: document.id,
        title: document.title,
        source: document.source,
        ingestedAt: document.ingestedAt,
        chunkCount: document.chunkIds.length,
      }))
    }
    return Object.freeze(summaries)
  }

  /**
   * Delete one document and every chunk it owns.
   * @param request - document identity.
   * @returns resolution after durable deletes.
   */
  async remove(request: ReferenceRemoveRequest): Promise<void> {
    const documents = this.requireDocuments()
    const chunks = this.requireChunks()
    const document = documents.get(request.documentId)
    if (document === undefined) {
      throw new Error(`references: document '${request.documentId}' not found`)
    }
    for (const chunkId of document.chunkIds) {
      await chunks.delete(chunkId)
    }
    await documents.delete(request.documentId)
  }

  /**
   * Build a navigable tree: sources → documents → chunk manifests.
   * @returns immutable index snapshot.
   */
  index(): ReferenceIndex {
    const documents = this.requireDocuments()
    const chunks = this.requireChunks()
    const bySource = new Map<string, {
      kind: ReferenceSource['kind']
      value: string
      documents: ReferenceIndexDocument[]
    }>()
    for (const [, document] of documents.entries()) {
      const key = `${document.source.kind}\0${document.source.value}`
      let bucket = bySource.get(key)
      if (bucket === undefined) {
        bucket = {
          kind: document.source.kind,
          value: document.source.value,
          documents: [],
        }
        bySource.set(key, bucket)
      }
      const manifests = document.chunkIds.map((chunkId) => {
        const chunk = chunks.get(chunkId)
        if (chunk === undefined) {
          throw new Error(`references: document '${document.id}' references missing chunk '${chunkId}'`)
        }
        return Object.freeze({
          id: chunk.id,
          index: chunk.index,
          preview: chunkPreview(chunk.text),
        })
      })
      bucket.documents.push(Object.freeze({
        id: document.id,
        title: document.title,
        chunks: Object.freeze(manifests),
      }))
    }
    const sources: ReferenceIndexSource[] = [...bySource.values()]
      .sort((left, right) => left.kind.localeCompare(right.kind) || left.value.localeCompare(right.value))
      .map(bucket => Object.freeze({
        kind: bucket.kind,
        value: bucket.value,
        documents: Object.freeze(bucket.documents),
      }))
    return Object.freeze({ sources: Object.freeze(sources) })
  }

  /** Read path text through `ctx.fs` or Node fs. */
  private async readPathText(path: string): Promise<string> {
    const fs = this.ctx.get('fs') as FsReader | undefined
    if (fs !== undefined) {
      const target = await fs.resolve(path)
      return fs.readText(target)
    }
    return readFile(path, 'utf8')
  }

  private requireDocuments(): KvTable<DocumentId, ReferenceDocument> {
    /* v8 ignore next 3 -- defensive: table is initialized in Service.init */
    if (this.documents === undefined) {
      throw new Error('references: durable domain is not initialized')
    }
    return this.documents
  }

  private requireChunks(): KvTable<ChunkId, ReferenceChunk> {
    /* v8 ignore next 3 -- defensive: table is initialized in Service.init */
    if (this.chunks === undefined) {
      throw new Error('references: durable domain is not initialized')
    }
    return this.chunks
  }
}

/** Freeze a validated source record. */
function freezeSource(source: ReferenceSource): ReferenceSource {
  const value = source.value.trim()
  if (value.length === 0) {
    throw new Error('references: source value must be a non-empty string')
  }
  return Object.freeze({ kind: source.kind, value })
}

/** Resolve and validate the optional top-K cap. */
function resolveTopK(topK: number | undefined): number {
  const value = topK ?? DEFAULT_SEARCH_TOP_K
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`references: topK must be a positive safe integer, got ${String(topK)}`)
  }
  return value
}

export default ReferencesStore

/**
 * Public request and value vocabulary for the reference document store.
 * This module contains types only.
 * @module @daoai/dao-references/types
 */

import type { Branded } from '@daoai/dao-brand'

/** Opaque identity of one ingested reference document. */
export type DocumentId = Branded<'DocumentId'>

/** Opaque identity of one text chunk inside a document. */
export type ChunkId = Branded<'ChunkId'>

/** Where the ingested text came from. */
export type ReferenceSource =
  | { readonly kind: 'path'; readonly value: string }
  | { readonly kind: 'url'; readonly value: string }

/** One durable document row. */
export interface ReferenceDocument {
  readonly id: DocumentId
  readonly title: string
  readonly source: ReferenceSource
  /** Host-assigned ingestion time in Unix epoch milliseconds. */
  readonly ingestedAt: number
  readonly chunkIds: readonly ChunkId[]
}

/** One durable chunk row. */
export interface ReferenceChunk {
  readonly id: ChunkId
  readonly documentId: DocumentId
  /** Zero-based order within the document. */
  readonly index: number
  readonly text: string
  /** SHA-256 hex digest of {@link text}. */
  readonly hash: string
}

/** Summary returned by {@link ReferencesStore.list}. */
export interface ReferenceDocumentSummary {
  readonly id: DocumentId
  readonly title: string
  readonly source: ReferenceSource
  readonly ingestedAt: number
  readonly chunkCount: number
}

/** One keyword search hit with owning document metadata. */
export interface ReferenceSearchHit {
  readonly chunkId: ChunkId
  readonly documentId: DocumentId
  readonly title: string
  readonly source: ReferenceSource
  readonly index: number
  readonly text: string
  readonly score: number
}

/** Chunk identity plus a short preview for index navigation. */
export interface ReferenceChunkManifest {
  readonly id: ChunkId
  readonly index: number
  /** First 120 characters of chunk text. */
  readonly preview: string
}

/** One document under a shared source in the navigable index. */
export interface ReferenceIndexDocument {
  readonly id: DocumentId
  readonly title: string
  readonly chunks: readonly ReferenceChunkManifest[]
}

/** One source bucket in the navigable index. */
export interface ReferenceIndexSource {
  readonly kind: ReferenceSource['kind']
  readonly value: string
  readonly documents: readonly ReferenceIndexDocument[]
}

/** Full navigable index tree. */
export interface ReferenceIndex {
  readonly sources: readonly ReferenceIndexSource[]
}

/** Ingest plain text with an explicit title and source. */
export interface AddFromTextRequest {
  readonly title: string
  readonly source: ReferenceSource
  readonly text: string
}

/** Ingest a local file; title is the basename. */
export interface AddFromPathRequest {
  readonly path: string
}

/** Ingest a remote URL via `ctx.web.fetch` when available. */
export interface AddFromUrlRequest {
  readonly url: string
}

/** Keyword search over chunk text. */
export interface ReferenceSearchRequest {
  readonly query: string
  /** Maximum hits to return; defaults to 5. */
  readonly topK?: number
}

/** Fetch one document or one chunk by id. */
export interface ReferenceGetRequest {
  readonly documentId?: DocumentId
  readonly chunkId?: ChunkId
}

/** Delete one document and all of its chunks. */
export interface ReferenceRemoveRequest {
  readonly documentId: DocumentId
}

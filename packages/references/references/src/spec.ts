/**
 * Durable storage-domain declaration for the reference document store.
 * @module @daoai/dao-references/src/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@daoai/dao-storage-domain'
import type { ChunkId, DocumentId, ReferenceChunk, ReferenceDocument, ReferenceSource } from './types.ts'

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Runtime schema for a path or URL source. */
export const referenceSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('path'), value: z.string().min(1) }),
  z.object({ kind: z.literal('url'), value: z.string().min(1) }),
]) satisfies z.ZodType<ReferenceSource>

/** Runtime schema for one document row. */
export const referenceDocumentSchema = z.object({
  id: z.string().min(1).transform(value => value as DocumentId),
  title: z.string().min(1),
  source: referenceSourceSchema,
  ingestedAt: nonNegativeSafeInteger,
  chunkIds: z.array(z.string().min(1).transform(value => value as ChunkId)),
}) as unknown as z.ZodType<ReferenceDocument>

/** Runtime schema for one chunk row. */
export const referenceChunkSchema = z.object({
  id: z.string().min(1).transform(value => value as ChunkId),
  documentId: z.string().min(1).transform(value => value as DocumentId),
  index: nonNegativeSafeInteger,
  text: z.string(),
  hash: z.string().min(1),
}) as unknown as z.ZodType<ReferenceChunk>

/** Durable reference store: documents and their text chunks. */
export const referencesDomainSpec = defineDomain({
  name: 'references',
  version: 0,
  tables: {
    documents: domainTable<DocumentId, ReferenceDocument>(referenceDocumentSchema),
    chunks: domainTable<ChunkId, ReferenceChunk>(referenceChunkSchema),
  },
})

/**
 * Fixed-size overlapping text chunking for the reference store.
 * @module @daoai/dao-references/src/chunk
 */

import { createHash } from 'node:crypto'

/** Approximate 500-token window in characters (~4 chars/token). */
export const CHUNK_CHAR_SIZE = 2000

/** Character overlap between consecutive chunks. */
export const CHUNK_CHAR_OVERLAP = 200

/**
 * Split text into overlapping character windows.
 * @param text - complete document body.
 * @returns ordered chunk strings; empty input yields one empty chunk.
 */
export function chunkText(text: string): string[] {
  if (text.length <= CHUNK_CHAR_SIZE) return [text]
  const step = CHUNK_CHAR_SIZE - CHUNK_CHAR_OVERLAP
  const chunks: string[] = []
  for (let start = 0; start < text.length; start += step) {
    chunks.push(text.slice(start, start + CHUNK_CHAR_SIZE))
    if (start + CHUNK_CHAR_SIZE >= text.length) break
  }
  return chunks
}

/**
 * Hex SHA-256 digest of chunk text.
 * @param text - chunk body.
 * @returns lowercase hex digest.
 */
export function hashChunkText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Preview string for index manifests (first 120 characters).
 * @param text - chunk body.
 * @returns truncated preview.
 */
export function chunkPreview(text: string): string {
  return text.length <= 120 ? text : text.slice(0, 120)
}

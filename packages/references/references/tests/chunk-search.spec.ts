import { describe, expect, it } from 'vitest'
import {
  CHUNK_CHAR_OVERLAP,
  CHUNK_CHAR_SIZE,
  chunkPreview,
  chunkText,
  hashChunkText,
} from '../src/chunk.ts'
import { scoreChunk, tokenize } from '../src/search.ts'

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    expect(chunkText('hello')).toEqual(['hello'])
  })

  it('splits long text with the configured overlap', () => {
    const text = 'a'.repeat(CHUNK_CHAR_SIZE + 50)
    const chunks = chunkText(text)
    expect(chunks.length).toBe(2)
    expect(chunks[0]).toHaveLength(CHUNK_CHAR_SIZE)
    expect(chunks[1]).toHaveLength(50 + CHUNK_CHAR_OVERLAP)
    expect(chunks[0]!.slice(-CHUNK_CHAR_OVERLAP)).toBe(chunks[1]!.slice(0, CHUNK_CHAR_OVERLAP))
  })

  it('hashes chunk text with sha256 hex', () => {
    expect(hashChunkText('abc')).toMatch(/^[0-9a-f]{64}$/u)
    expect(hashChunkText('abc')).toBe(hashChunkText('abc'))
    expect(hashChunkText('abc')).not.toBe(hashChunkText('abd'))
  })

  it('previews the first 120 characters', () => {
    expect(chunkPreview('short')).toBe('short')
    expect(chunkPreview('x'.repeat(200))).toHaveLength(120)
  })
})

describe('keyword search scoring', () => {
  it('tokenizes on non-alphanumeric runs and casefolds', () => {
    expect(tokenize('Hello, WORLD! 123')).toEqual(['hello', 'world', '123'])
  })

  it('scores by query-term frequency over chunk length', () => {
    const chunk = 'alpha beta alpha gamma'
    // tokens: alpha, beta, alpha, gamma → length 4; query alpha → freq 2 → 2/4
    expect(scoreChunk('alpha', chunk)).toBe(0.5)
    expect(scoreChunk('missing', chunk)).toBe(0)
    expect(scoreChunk('', chunk)).toBe(0)
  })
})

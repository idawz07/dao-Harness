/**
 * Keyword tokenization and chunk scoring for the reference store.
 * @module @daoai/dao-references/src/search
 */

/**
 * Split text on non-alphanumeric runs and casefold.
 * @param text - free text.
 * @returns lowercase alphanumeric tokens.
 */
export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/u).filter(token => token.length > 0)
}

/**
 * Score one chunk against a keyword query.
 * Score is the sum of query-term frequencies in the chunk divided by the
 * chunk's token count (length factor). Missing query terms contribute zero.
 * @param query - free-text query.
 * @param chunkText - chunk body to score.
 * @returns non-negative relevance score; zero when either side has no tokens.
 */
export function scoreChunk(query: string, chunkText: string): number {
  const queryTerms = [...new Set(tokenize(query))]
  if (queryTerms.length === 0) return 0
  const chunkTerms = tokenize(chunkText)
  if (chunkTerms.length === 0) return 0
  const frequencies = new Map<string, number>()
  for (const term of chunkTerms) {
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1)
  }
  let sum = 0
  for (const term of queryTerms) {
    sum += frequencies.get(term) ?? 0
  }
  return sum / chunkTerms.length
}

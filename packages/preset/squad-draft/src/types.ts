/** Client-safe payloads for explicit squad-member drafting. */

/** Validated draft returned for review, never committed by the drafting service. */
export interface SquadMemberDraft {
  /** Proposed display name. */
  readonly name: string
  /** Proposed one-sentence role description. */
  readonly description: string
  /** Proposed persona text. */
  readonly persona: string
  /** Restrict-only tool removals suggested for review. */
  readonly toolsDenySuggestion: readonly string[]
}

/** Optional existing member supplied as drafting context. */
export interface SquadDraftBaseMember {
  /** Stable member id from the current roster. */
  readonly id: string
}

export {}

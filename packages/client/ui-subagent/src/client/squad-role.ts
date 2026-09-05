/**
 * Map a subagent UI label to a Dao squad role for roster accent styling.
 * Labels from the orchestrator's specialist tools start with the role name
 * (see the `standard` delegation-playbook skill).
 * @module
 */

/** Closed set of gamified specialist ids (Stage 4 roster). */
export type SquadRoleId = 'scout' | 'forge' | 'lens' | 'quill' | 'relay' | 'scribe'

/** Role ids in display order. */
export const SQUAD_ROLE_IDS = [
  'scout', 'forge', 'lens', 'quill', 'relay', 'scribe',
] as const satisfies readonly SquadRoleId[]

/**
 * Resolve a catalog label to a squad role when the label names one.
 * @param label - the subagent `description` / catalog label.
 * @returns the role id, or `undefined` for ad-hoc subagents.
 */
export function squadRoleFromLabel(label: string): SquadRoleId | undefined {
  const head = label.trim().split(/[\s:·\-—–|/]+/u, 1)[0]?.toLowerCase()
  if (head === undefined) return undefined
  for (const role of SQUAD_ROLE_IDS) {
    if (head === role) return role
  }
  return undefined
}

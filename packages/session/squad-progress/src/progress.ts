/**
 * Pure fold helpers for squad XP awards from session events.
 *
 * @module @daoai/dao-squad-progress/progress
 */

import type { ToolResultMessage } from '@daoai/dao-llm'
import { earnBadges } from './badges.ts'
import { levelFromXp } from './level.ts'
import type { SquadBadgeId } from './types.ts'

/** XP awarded for one successful non-delegation tool result. */
export const XP_TOOL_SUCCESS = 1
/** XP awarded when a delegation tool successfully starts or completes a child. */
export const XP_CHILD_SPAWNED = 2
/** XP awarded when a foreground delegation tool returns a completed child result. */
export const XP_CHILD_SETTLED = 5

/**
 * Whether a model-facing tool name is a `dao-tool-subagent` delegation tool.
 * @param name - Candidate tool name.
 * @returns True when the name matches a delegation tool.
 */
export function isDelegationToolName(name: string): boolean {
  return name === 'subagent' || name.startsWith('subagent_')
}

/**
 * Read the concatenated text from a tool-result message's primary block.
 * @param message - the `tool/result` event's message payload.
 * @returns joined text content, or an empty string when none is present.
 */
export function toolResultText(message: ToolResultMessage): string {
  return message.content[0].content
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map(part => part.text)
    .join('')
}

/**
 * Whether a successful delegation tool result is a background/continuable
 * start notice rather than a foreground settle.
 * @param text - rendered tool-result text.
 * @returns true when the result only announced a background or continuable start.
 */
export function isBackgroundDelegationStart(text: string): boolean {
  return text.startsWith('started background subagent job ')
    || text.startsWith('started subagent ')
}

/**
 * Whether a tool-result message reports success to the model.
 * @param message - the `tool/result` event's message payload.
 * @returns true when the primary tool-result block is present and not an error.
 */
export function isToolResultSuccess(message: ToolResultMessage): boolean {
  return message.content[0].isError !== true
}

/** Mutable counters carried inside the projection fold state. */
export interface SquadProgressCounters {
  /** Successful tool results (every non-error tool/result). */
  toolSuccesses: number
  /** Successful delegation-tool results (spawn awards). */
  spawnSuccesses: number
  /** Completed turns with no tool errors. */
  errorFreeTurns: number
}

/** Fold state exposed to the projection unit (JSON-serializable). */
export interface SquadProgressState {
  xp: number
  level: number
  badges: SquadBadgeId[]
  toolSuccesses: number
  spawnSuccesses: number
  errorFreeTurns: number
  /** Pending tool call names keyed by callId until their result lands. */
  pendingCalls: Record<string, string>
  /** Whether the open turn has seen a tool error so far. */
  turnHasToolError: boolean
  /** Whether a turn is currently open. */
  turnOpen: boolean
}

/**
 * Build the initial empty progress state.
 * @returns Initial zeroed squad progress state.
 */
export function initSquadProgressState(): SquadProgressState {
  return {
    xp: 0,
    level: 1,
    badges: [],
    toolSuccesses: 0,
    spawnSuccesses: 0,
    errorFreeTurns: 0,
    pendingCalls: {},
    turnHasToolError: false,
    turnOpen: false,
  }
}

/**
 * Recompute level and badges after counters/xp change.
 * @param state - state after XP/counter mutations (badges may be stale).
 * @returns state with refreshed level and any newly earned badges.
 */
function finalizeAwards(state: SquadProgressState): SquadProgressState {
  const level = levelFromXp(state.xp)
  const badges = earnBadges(state.badges, {
    toolSuccesses: state.toolSuccesses,
    spawnSuccesses: state.spawnSuccesses,
    errorFreeTurns: state.errorFreeTurns,
  })
  if (level === state.level && badges === state.badges) return state
  return {
    ...state,
    level,
    badges: badges === state.badges ? state.badges : [...badges],
  }
}

/**
 * Apply one successful tool result's XP awards.
 * @param state - current fold state.
 * @param toolName - the matching `tool/call` name, when known.
 * @param resultText - rendered tool-result text (for background detection).
 * @returns updated state (new reference).
 */
export function applySuccessfulToolResult(
  state: SquadProgressState,
  toolName: string | undefined,
  resultText: string,
): SquadProgressState {
  let xp = state.xp + XP_TOOL_SUCCESS
  let spawnSuccesses = state.spawnSuccesses
  if (toolName !== undefined && isDelegationToolName(toolName)) {
    xp += XP_CHILD_SPAWNED
    spawnSuccesses += 1
    if (!isBackgroundDelegationStart(resultText)) {
      xp += XP_CHILD_SETTLED
    }
  }
  return finalizeAwards({
    ...state,
    xp,
    toolSuccesses: state.toolSuccesses + 1,
    spawnSuccesses,
  })
}

/**
 * Close a completed turn and award error-free credit when no tool errors ran.
 * @param state - current fold state.
 * @returns updated state (same reference when the turn was not open).
 */
export function applyCompletedTurn(state: SquadProgressState): SquadProgressState {
  if (!state.turnOpen) return state
  const errorFreeTurns = state.turnHasToolError
    ? state.errorFreeTurns
    : state.errorFreeTurns + 1
  const next: SquadProgressState = {
    ...state,
    errorFreeTurns,
    turnOpen: false,
    turnHasToolError: false,
    pendingCalls: Object.keys(state.pendingCalls).length === 0 ? state.pendingCalls : {},
  }
  return finalizeAwards(next)
}

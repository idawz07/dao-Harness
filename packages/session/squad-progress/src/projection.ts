/**
 * The `squadProgress` projection unit: a pure fold of tool results and turn
 * boundaries into per-session XP, level, and earned badges.
 *
 * @module @daoai/dao-squad-progress/projection
 */

import { z } from 'zod'
import type { ProjectionDefinition } from '@daoai/dao-session-projection'
import {
  applyCompletedTurn,
  applySuccessfulToolResult,
  initSquadProgressState,
  isToolResultSuccess,
  toolResultText,
  type SquadProgressState,
} from './progress.ts'
import type { SquadBadgeId, SquadProgressProjection } from './types.ts'

declare module '@daoai/dao-session-projection/types' {
  interface SessionProjectionStateMap {
    squadProgress: SquadProgressState
  }
}

const badgeIdSchema = z.union([
  z.literal('first_delegation'),
  z.literal('ten_tools'),
  z.literal('error_free_turn'),
]) satisfies z.ZodType<SquadBadgeId>

const squadProgressViewSchema: z.ZodType<SquadProgressProjection> = z.object({
  xp: z.number().int().nonnegative(),
  level: z.number().int().positive(),
  badges: z.array(badgeIdSchema),
}).strict()

const squadProgressStateSchema: z.ZodType<SquadProgressState> = z.object({
  xp: z.number().int().nonnegative(),
  level: z.number().int().positive(),
  badges: z.array(badgeIdSchema),
  toolSuccesses: z.number().int().nonnegative(),
  spawnSuccesses: z.number().int().nonnegative(),
  errorFreeTurns: z.number().int().nonnegative(),
  pendingCalls: z.record(z.string(), z.string()),
  turnHasToolError: z.boolean(),
  turnOpen: z.boolean(),
}).strict()

/** The `squadProgress` unit registered on `ctx.sessionProjections`. */
export const squadProgressProjectionDefinition = {
  key: 'squadProgress',
  stateVersion: 1,
  stateSchema: squadProgressStateSchema,
  init: () => initSquadProgressState(),
  apply: (state, event) => {
    switch (event.type) {
      case 'turn/start':
        return {
          ...state,
          turnOpen: true,
          turnHasToolError: false,
        }
      case 'tool/call':
        return {
          ...state,
          pendingCalls: { ...state.pendingCalls, [event.data.callId]: event.data.name },
        }
      case 'tool/result': {
        const callId = event.data.message.source.callId
        const toolName = Object.hasOwn(state.pendingCalls, callId)
          ? state.pendingCalls[callId]
          : undefined
        const pendingCalls = Object.fromEntries(
          Object.entries(state.pendingCalls).filter(([id]) => id !== callId),
        )
        const success = isToolResultSuccess(event.data.message) && event.data.error === undefined
        if (!success) {
          return {
            ...state,
            pendingCalls,
            turnHasToolError: state.turnOpen ? true : state.turnHasToolError,
          }
        }
        return applySuccessfulToolResult(
          { ...state, pendingCalls },
          toolName,
          toolResultText(event.data.message),
        )
      }
      case 'turn/end': {
        if (event.data.reason.kind !== 'completed') {
          return state.turnOpen || Object.keys(state.pendingCalls).length > 0
            ? {
              ...state,
              turnOpen: false,
              turnHasToolError: false,
              pendingCalls: Object.keys(state.pendingCalls).length === 0
                ? state.pendingCalls
                : {},
            }
            : state
        }
        return applyCompletedTurn(state)
      }
      default:
        return state
    }
  },
  wire: {
    viewSchema: squadProgressViewSchema,
    view: state => ({
      xp: state.xp,
      level: state.level,
      badges: state.badges,
    }),
  },
} satisfies ProjectionDefinition<'squadProgress', SquadProgressState>

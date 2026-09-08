/**
 * Unit tests for XP awards, level curve, badge rules, and the projection fold.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@daoai/cordis'
import { createToolResultMessage, ToolCallId } from '@daoai/dao-llm'
import SessionStore, { SessionId } from '@daoai/dao-session'
import type { Session } from '@daoai/dao-session'
import SessionProjectionRegistry from '@daoai/dao-session-projection'
import Storage, { storageBackendServiceKey } from '@daoai/dao-storage'
import * as StorageDomain from '@daoai/dao-storage-domain'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import SquadProgress, {
  applyCompletedTurn,
  applySuccessfulToolResult,
  earnBadges,
  isBackgroundDelegationStart,
  levelFromXp,
  squadProgressDomainSpec,
  squadProgressProjectionDefinition,
  squadProgressRowSchema,
  toolResultText,
  XP_CHILD_SETTLED,
  XP_CHILD_SPAWNED,
  XP_TOOL_SUCCESS,
} from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('levelFromXp', () => {
  it('starts at level 1 and follows floor(sqrt(xp/10))+1', () => {
    expect(levelFromXp(0)).toBe(1)
    expect(levelFromXp(9)).toBe(1)
    expect(levelFromXp(10)).toBe(2)
    expect(levelFromXp(40)).toBe(3)
    expect(levelFromXp(90)).toBe(4)
  })
})

describe('earnBadges', () => {
  it('awards each badge once in rule order', () => {
    expect(earnBadges([], {
      toolSuccesses: 10,
      spawnSuccesses: 1,
      errorFreeTurns: 1,
    })).toEqual(['first_delegation', 'ten_tools', 'error_free_turn'])
    expect(earnBadges(['first_delegation'], {
      toolSuccesses: 10,
      spawnSuccesses: 2,
      errorFreeTurns: 0,
    })).toEqual(['first_delegation', 'ten_tools'])
  })
})

describe('squadProgressDomainSpec', () => {
  it('defines the squad_progress storage domain', () => {
    expect(squadProgressDomainSpec.name).toBe('squad_progress')
    expect(squadProgressDomainSpec.version).toBe(1)
  })
})

describe('squadProgress projection unit', () => {
  async function harness(): Promise<{ ctx: Context; session: Session }> {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(Storage)
    const backend = new MemoryStorageBackend()
    ctx.storage.backend.register('memory', backend)
    ctx.provide(storageBackendServiceKey('memory'), backend)
    await ctx.plugin(StorageDomain, { backend: 'memory' })
    await ctx.plugin(SquadProgress)
    return { ctx, session: ctx.sessions.create(SessionId('squad')) }
  }

  it('awards tool, spawn, and settle XP and serves the wire view', async () => {
    const { ctx, session } = await harness()
    session.append('turn/start', { turn: 1 })
    session.append('tool/call', {
      turn: 1, step: 1, callId: ToolCallId('t1'), name: 'bash', arguments: '{}',
    })
    session.append('tool/result', {
      turn: 1, step: 1,
      message: createToolResultMessage({
        callId: ToolCallId('t1'),
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      }),
    }, { surfaceOp: 'append' })
    session.append('tool/call', {
      turn: 1, step: 1, callId: ToolCallId('s1'), name: 'subagent_scout', arguments: '{}',
    })
    session.append('tool/result', {
      turn: 1, step: 1,
      message: createToolResultMessage({
        callId: ToolCallId('s1'),
        content: [{ type: 'text', text: 'scout report' }],
        isError: false,
      }),
    }, { surfaceOp: 'append' })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const expectedXp = XP_TOOL_SUCCESS
      + XP_TOOL_SUCCESS + XP_CHILD_SPAWNED + XP_CHILD_SETTLED
    const view = ctx.sessionProjections.snapshot(session).values.squadProgress
    expect(view).toEqual({
      xp: expectedXp,
      level: levelFromXp(expectedXp),
      badges: ['first_delegation', 'error_free_turn'],
    })
    // Mirror writes are async void via storage-domain enqueue; wait for the row.
    await expect.poll(() => ctx.squadProgress.get(session.id)).toMatchObject({
      sessionId: session.id,
      xp: expectedXp,
      badges: ['first_delegation', 'error_free_turn'],
    })
  })

  it('awards spawn without settle for background start notices', async () => {
    const { ctx, session } = await harness()
    session.append('turn/start', { turn: 1 })
    session.append('tool/call', {
      turn: 1, step: 1, callId: ToolCallId('s1'), name: 'subagent', arguments: '{}',
    })
    session.append('tool/result', {
      turn: 1, step: 1,
      message: createToolResultMessage({
        callId: ToolCallId('s1'),
        content: [{ type: 'text', text: 'started subagent child-1' }],
        isError: false,
      }),
    }, { surfaceOp: 'append' })
    const view = ctx.sessionProjections.snapshot(session).values.squadProgress
    expect(view).toBeDefined()
    expect(view!.xp).toBe(XP_TOOL_SUCCESS + XP_CHILD_SPAWNED)
    expect(view!.badges).toEqual(['first_delegation'])
  })

  it('awards ten_tools after ten successes and keeps the same reference on idle events', () => {
    let state = squadProgressProjectionDefinition.init()
    for (let i = 0; i < 10; i += 1) {
      const callId = ToolCallId(`c${i}`)
      state = squadProgressProjectionDefinition.apply(state, {
        type: 'tool/call',
        seq: i * 2,
        time: i,
        data: { turn: 1, step: 1, callId, name: 'bash', arguments: '{}' },
      } as never)
      state = squadProgressProjectionDefinition.apply(state, {
        type: 'tool/result',
        seq: i * 2 + 1,
        time: i,
        data: {
          turn: 1,
          step: 1,
          message: createToolResultMessage({
            callId,
            content: [{ type: 'text', text: 'ok' }],
            isError: false,
          }),
        },
      } as never)
    }
    expect(state.toolSuccesses).toBe(10)
    expect(state.badges).toContain('ten_tools')
    const idle = squadProgressProjectionDefinition.apply(state, {
      type: 'step/start',
      seq: 100,
      time: 100,
      data: { turn: 1, step: 2 },
    } as never)
    expect(idle).toBe(state)
  })

  it('parses squadProgressRowSchema and validates schema transforms', () => {
    const parsed = squadProgressRowSchema.parse({
      sessionId: 'sess-1',
      xp: 10,
      level: 2,
      badges: ['first_delegation'],
      updatedAt: 12345,
    })
    expect(parsed.sessionId).toBe('sess-1')
    expect(parsed.level).toBe(2)
  })

  it('handles background jobs, non-text tool results, and unknown sessions in store', async () => {
    const { ctx, session } = await harness()
    expect(ctx.squadProgress.get(SessionId('missing-sess'))).toBeUndefined()

    // Test text starting with 'started background subagent job '
    expect(isBackgroundDelegationStart('started background subagent job job-99')).toBe(true)

    // Test toolResultText with non-text parts
    const msgWithImage = createToolResultMessage({
      callId: ToolCallId('img-call'),
      content: [{ type: 'image', attachment: 'ref-1' as never }],
      isError: false,
    })
    expect(toolResultText(msgWithImage)).toBe('')

    // Test tool result without prior call (toolName is undefined)
    session.append('tool/result', {
      turn: 1, step: 1,
      message: createToolResultMessage({
        callId: ToolCallId('orphan-tool'),
        content: [{ type: 'text', text: 'no prior call' }],
        isError: false,
      }),
    }, { surfaceOp: 'append' })
    const view = ctx.sessionProjections.snapshot(session).values.squadProgress
    expect(view?.xp).toBe(XP_TOOL_SUCCESS)
  })

  it('handles tool errors, turn failures, and dangling calls in projection fold', () => {
    let state = squadProgressProjectionDefinition.init()

    // applyCompletedTurn when turnOpen is false returns state
    expect(applyCompletedTurn(state)).toBe(state)

    // Tool call added to pendingCalls
    state = squadProgressProjectionDefinition.apply(state, {
      type: 'tool/call', seq: 1, time: 1,
      data: { turn: 1, step: 1, callId: ToolCallId('fail-call'), name: 'bash', arguments: '{}' },
    } as never)
    expect(state.pendingCalls['fail-call']).toBe('bash')

    // Tool result is error while turn is closed -> turnHasToolError stays false
    state = squadProgressProjectionDefinition.apply(state, {
      type: 'tool/result', seq: 2, time: 2,
      data: {
        turn: 1, step: 1,
        message: createToolResultMessage({
          callId: ToolCallId('fail-call'),
          content: [{ type: 'text', text: 'fail' }],
          isError: true,
        }),
      },
    } as never)
    expect(state.turnHasToolError).toBe(false)
    expect(state.pendingCalls['fail-call']).toBeUndefined()

    // Open turn
    state = squadProgressProjectionDefinition.apply(state, {
      type: 'turn/start', seq: 3, time: 3, data: { turn: 1 },
    } as never)
    expect(state.turnOpen).toBe(true)

    // Tool error while turn is open -> turnHasToolError becomes true
    state = squadProgressProjectionDefinition.apply(state, {
      type: 'tool/result', seq: 4, time: 4,
      data: {
        turn: 1, step: 1,
        error: { message: 'boom' },
        message: createToolResultMessage({
          callId: ToolCallId('err-call'),
          content: [{ type: 'text', text: 'boom' }],
          isError: true,
        }),
      },
    } as never)
    expect(state.turnHasToolError).toBe(true)

    // Turn end with non-completed reason resets turnOpen and turnHasToolError
    const aborted = squadProgressProjectionDefinition.apply(state, {
      type: 'turn/end', seq: 5, time: 5,
      data: { turn: 1, reason: { kind: 'aborted' } },
    } as never)
    expect(aborted.turnOpen).toBe(false)
    expect(aborted.turnHasToolError).toBe(false)

    // Non-completed turn end when turn is already closed and pendingCalls is empty returns state
    const abortedAgain = squadProgressProjectionDefinition.apply(aborted, {
      type: 'turn/end', seq: 6, time: 6,
      data: { turn: 1, reason: { kind: 'aborted' } },
    } as never)
    expect(abortedAgain).toBe(aborted)

    // Completed turn where turnHasToolError was true does not increment errorFreeTurns
    const erroredTurnState = squadProgressProjectionDefinition.apply(state, {
      type: 'turn/end', seq: 7, time: 7,
      data: { turn: 1, reason: { kind: 'completed' } },
    } as never)
    expect(erroredTurnState.errorFreeTurns).toBe(0)

    // Validate wire view schema
    const wireView = squadProgressProjectionDefinition.wire.view(erroredTurnState)
    expect(squadProgressProjectionDefinition.wire.viewSchema.parse(wireView)).toEqual(wireView)

    // Non-completed turn end when turn has dangling pending calls resets pendingCalls
    const stateWithDangling = {
      ...squadProgressProjectionDefinition.init(),
      turnOpen: true,
      pendingCalls: { 'call-x': 'bash' },
    }
    const abortedDangling = squadProgressProjectionDefinition.apply(stateWithDangling, {
      type: 'turn/end', seq: 8, time: 8,
      data: { turn: 1, reason: { kind: 'aborted' } },
    } as never)
    expect(abortedDangling.pendingCalls).toEqual({})

    // applyCompletedTurn when pendingCalls is non-empty resets pendingCalls
    const completedDangling = applyCompletedTurn({
      ...squadProgressProjectionDefinition.init(),
      turnOpen: true,
      pendingCalls: { 'call-y': 'bash' },
    })
    expect(completedDangling.pendingCalls).toEqual({})

    // Level up without earning new badges (badges === state.badges path in finalizeAwards)
    const levelingState = {
      ...squadProgressProjectionDefinition.init(),
      xp: 9,
      toolSuccesses: 1,
    }
    const leveled = applySuccessfulToolResult(levelingState, 'bash', 'ok')
    expect(leveled.level).toBe(2)
    expect(leveled.badges).toBe(levelingState.badges)
  })
})

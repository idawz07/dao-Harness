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
  levelFromXp,
  earnBadges,
  XP_CHILD_SETTLED,
  XP_CHILD_SPAWNED,
  XP_TOOL_SUCCESS,
  squadProgressProjectionDefinition,
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
})

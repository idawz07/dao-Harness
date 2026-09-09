/** Roster changes own the lifecycle of named squad delegation tools. */

import { Context } from '@daoai/cordis'
import type { AgentPresetRow, SquadService, SquadSessionMember } from '@daoai/dao-agent-presets/types'
import SubagentRuntime from '@daoai/dao-subagent'
import SystemPrompt from '@daoai/dao-system-prompt'
import ToolRuntime from '@daoai/dao-tools'
import { describe, expect, it } from 'vitest'
import * as SquadRoster from '@daoai/dao-squad-roster'

function member(id: string, persona = `You are ${id}.`): AgentPresetRow {
  return {
    id,
    trust: 'system',
    isDefault: false,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    description: `Handles ${id} work.`,
    squadMember: true,
    persona,
    personaOverridden: false,
    revision: null,
    tools: [],
  }
}

async function setup(initial: AgentPresetRow[], config: SquadRoster.Config = {}) {
  const ctx = new Context()
  let rows = initial
  let failure: Error | undefined
  await ctx.plugin(SystemPrompt, {
    includeHarnessIdentity: false,
    includeRuntimeContext: false,
    persona: '',
  })
  await ctx.plugin(ToolRuntime, { mode: 'native', maxParallelSubCalls: 10 })
  await ctx.plugin(SubagentRuntime)
  ctx.subagents.registerProvider({
    name: 'spawn',
    inheritsParentContext: false,
    capabilities: {
      agentOptions: true,
      outputSchema: true,
      depthLimit: true,
      toolFilter: true,
      persona: true,
    },
    prepareContinuable: () => Promise.reject(new Error('not called')),
    start: () => Promise.reject(new Error('not called')),
  })
  ctx.provide('squad', {
    roster: () => failure === undefined
      ? Promise.resolve({ presets: rows, authorable: true, maxAvatarBytes: 2 * 1024 * 1024 })
      : Promise.reject(failure),
  } as unknown as SquadService)
  await ctx.plugin(SquadRoster, config)
  return {
    ctx,
    set(next: AgentPresetRow[]) {
      rows = next
      ctx.emit('squad/change')
    },
    fail(error: Error) {
      failure = error
      ctx.emit('squad/change')
    },
  }
}

describe('dao-squad-roster', () => {
  it('renders stable guidance from effective members', () => {
    expect(SquadRoster.renderSquadGuidance([member('scout')])).toContain(
      '- Scout (scout): use `subagent_scout` — Handles scout work.',
    )
    expect(SquadRoster.renderSquadGuidance([member('scout')]))
      .toBe(SquadRoster.renderSquadGuidance([member('scout')]))
    expect(SquadRoster.renderSquadGuidance([])).toBe('')
    const { name: _name, description: _description, ...fallback } = member('fallback')
    expect(SquadRoster.renderSquadGuidance([fallback]))
      .toContain('- fallback (fallback): use `subagent_fallback`')
  })

  it('adds, replaces, and removes named tools with roster changes', async () => {
    const harness = await setup([member('scout')])
    expect(harness.ctx.tools.schemas().map(tool => tool.name)).toContain('subagent_scout')

    harness.set([member('scout', 'Updated Scout.'), member('reviewer')])
    await expect.poll(() => harness.ctx.tools.schemas().map(tool => tool.name).sort())
      .toEqual(['subagent_reviewer', 'subagent_scout'])

    harness.set([member('reviewer')])
    await expect.poll(() => harness.ctx.tools.schemas().map(tool => tool.name))
      .toEqual(['subagent_reviewer'])

    harness.set([member('reviewer')])
    await expect.poll(() => harness.ctx.tools.schemas().map(tool => tool.name))
      .toEqual(['subagent_reviewer'])
    await harness.ctx.fiber.dispose()
  })

  it('orders members and covers shipped allow and deny policies', async () => {
    const later = { ...member('forge'), order: 20, tools: ['write'] }
    const earlier = { ...member('scout'), order: 10 }
    const { ctx } = await setup([later, earlier])
    const text = (await ctx.systemPrompt.assemble()).sections
      .find(section => section.name === 'squad:roster')?.text ?? ''
    expect(text.indexOf('Scout')).toBeLessThan(text.indexOf('Forge'))
    expect(ctx.tools.schemas().map(tool => tool.name).sort())
      .toEqual(['subagent_forge', 'subagent_scout'])
  })

  it('mounts a frozen session roster without reading live rows', async () => {
    const frozen: SquadSessionMember[] = [{
      id: 'frozen', trust: 'user', persona: 'Frozen role.', tools: [],
    }]
    const populated = await setup([], { frozen: true, members: frozen })
    expect(populated.ctx.tools.schemas().map(tool => tool.name)).toEqual(['subagent_frozen'])
    const empty = await setup([member('ignored')], { frozen: true })
    expect(empty.ctx.tools.schemas()).toEqual([])
  })

  it('logs a rejected live reconciliation and still disposes cleanly', async () => {
    const harness = await setup([member('scout')])
    const errors: string[] = []
    harness.ctx.logger.error = ((message: unknown) => { errors.push(String(message)) }) as typeof harness.ctx.logger.error
    harness.fail(new Error('roster failed'))
    await expect.poll(() => errors).toEqual([expect.stringContaining('roster failed')])
    await harness.ctx.fiber.dispose()
  })

  it('omits non-member, broken, and persona-less rows', async () => {
    const ordinary = { ...member('ordinary'), squadMember: false }
    const broken = { ...member('broken'), broken: 'bad composition' }
    const { persona: _persona, ...noPersona } = member('empty')
    const { ctx } = await setup([ordinary, broken, noPersona])

    expect(ctx.tools.schemas()).toEqual([])
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.find(section => section.name === 'squad:roster')?.text).toBe('')
  })
})

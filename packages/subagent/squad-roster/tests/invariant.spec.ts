import { Context } from '@daoai/cordis'
import InvariantRegistry from '@daoai/dao-invariants'
import SystemPrompt, { type PromptAssembly } from '@daoai/dao-system-prompt'
import * as SquadRosterInvariant from '@daoai/dao-squad-roster/invariant'
import { describe, expect, it } from 'vitest'

const valid = (): PromptAssembly => ({
  sections: [{
    name: 'squad:roster',
    text: '- Scout (scout): use `subagent_scout` — Researches.\nUse specialists.',
  }],
  contexts: [],
  tools: [{ name: 'subagent_scout', description: 'Delegate', parameters: {} }],
  variables: {},
})

async function assemble(ctx: Context, result: PromptAssembly): Promise<PromptAssembly> {
  return ctx.waterfall(
    ctx as never,
    'system-prompt/assemble',
    valid(),
    {},
    () => Promise.resolve(result),
  )
}

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(InvariantRegistry)
  await ctx.plugin(SystemPrompt, {
    includeHarnessIdentity: false,
    includeRuntimeContext: false,
    persona: '',
  })
  await ctx.plugin(SquadRosterInvariant)
  return ctx
}

describe('squad-roster invariant', () => {
  it('accepts guidance whose generated tools are present', async () => {
    const ctx = await setup()
    await expect(assemble(ctx, valid())).resolves.toEqual(valid())
  })

  it('rejects model-visible members without their generated tools', async () => {
    const ctx = await setup()
    await expect(assemble(ctx, { ...valid(), tools: [] }))
      .rejects.toThrow('squad roster references missing tool schemas [subagent_scout]')
  })

  it('accepts an absent or empty roster section', async () => {
    const ctx = await setup()
    await expect(assemble(ctx, { ...valid(), sections: [] })).resolves.toMatchObject({ sections: [] })
    await expect(assemble(ctx, {
      ...valid(), sections: [{ name: 'squad:roster', text: '' }],
    })).resolves.toBeDefined()
  })

  it('rejects duplicate sections, malformed lines, and duplicate generated tools', async () => {
    const duplicate = await setup()
    await expect(assemble(duplicate, {
      ...valid(), sections: [...valid().sections, ...valid().sections],
    })).rejects.toThrow('duplicate squad:roster sections')

    const malformed = await setup()
    await expect(assemble(malformed, {
      ...valid(), sections: [{ name: 'squad:roster', text: '- malformed' }],
    })).rejects.toThrow('must name its generated delegation tool')

    const repeated = await setup()
    await expect(assemble(repeated, {
      ...valid(),
      sections: [{
        name: 'squad:roster',
        text: '- Scout (scout): use `subagent_scout`\n- Scout again (scout): use `subagent_scout`',
      }],
    })).rejects.toThrow('must name distinct delegation tools')
  })
})

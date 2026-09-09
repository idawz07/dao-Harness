/** Roster-driven named delegation tools and deterministic squad guidance. */

import type { Context } from '@daoai/cordis'
import z from '@daoai/schemastery'
import type { AgentPresetRow, SquadSessionMember } from '@daoai/dao-agent-presets/types'
import { FIRST_PARTY_SECTION_ORDER } from '@daoai/dao-system-prompt'
import * as ToolSubagent from '@daoai/dao-tool-subagent'

export const name = 'squad-roster'
export const inject = ['squad', 'systemPrompt']

/** Optional immutable roster supplied by an Agent preset's Session generation. */
export interface Config {
  /** Mount one immutable session roster instead of following global authoring writes. */
  frozen?: boolean
  /** Effective model-visible members captured for the session generation. */
  members?: SquadSessionMember[]
}

/** Runtime schema for the internal frozen-roster patch. */
export const Config = z.object({
  frozen: z.boolean().default(false),
  members: z.array(z.object({
    id: z.string().required(),
    trust: z.union(['system', 'user'] as const).required(),
    name: z.string(),
    description: z.string(),
    order: z.number(),
    persona: z.string().required(),
    tools: z.array(z.string()).required(),
  })),
}) as z<Config>

/* v8 ignore next -- CI owns the Windows-specific shell-tool spelling. */
const RELAY_SHELL_TOOL = process.platform === 'win32' ? 'pwsh' : 'bash'

/** Shipped role policy retained while persona text comes from each member preset. */
const SHIPPED_FILTERS: Readonly<Record<string, ToolSubagent.Config['toolFilter']>> = {
  scout: { allow: ['web_search', 'web_fetch', 'read', 'read_image', 'grep', 'glob', 'skill'] },
  forge: { deny: ['workflow', 'ralph', 'send_message', 'interrupt_agent', 'list_agents'] },
  lens: { allow: ['read', 'read_image', 'grep', 'glob', 'skill'] },
  quill: { allow: ['read', 'read_image', 'write', 'edit', 'grep', 'glob', 'skill'] },
  relay: {
    allow: [
      RELAY_SHELL_TOOL,
      'job_kill', 'job_list', 'job_output', 'read', 'read_image', 'grep', 'glob', 'skill',
    ],
  },
  scribe: { allow: ['read', 'read_image', 'grep', 'glob', 'skill'] },
}

/** Roster row proven usable for named delegation. */
type EffectiveMember = AgentPresetRow & { readonly persona: string }

/** Programmatic plugin handle retained so one roster entry can be replaced. */
interface MemberHandle {
  readonly fingerprint: string
  dispose(): Promise<void>
}

/** Read the schema-normalized frozen roster. */
function frozenMembers(config: Config): readonly SquadSessionMember[] {
  /* v8 ignore next -- The Config schema materializes an omitted array before apply. */
  return config.members ?? []
}

/** Stable member order shared by prompt guidance and registration. */
function compareMembers(left: AgentPresetRow, right: AgentPresetRow): number {
  const order = (left.order ?? Number.POSITIVE_INFINITY) - (right.order ?? Number.POSITIVE_INFINITY)
  return Number.isNaN(order) || order === 0 ? left.id.localeCompare(right.id) : order
}

/**
 * Render model-visible roster prose from effective member fields.
 * @param members - Ordered effective squad members.
 * @returns Stable roster guidance, or empty text for an empty roster.
 */
export function renderSquadGuidance(members: readonly AgentPresetRow[]): string {
  if (members.length === 0) return ''
  return 'Your squad members are:\n' + members.map((member) => {
    const name = member.name ?? member.id
    const description = member.description === undefined ? '' : ` — ${member.description}`
    return `- ${name} (${member.id}): use \`subagent_${member.id}\`${description}`
  }).join('\n')
    + '\n\nLoad the `delegation-playbook` skill before non-trivial delegation. Use named squad tools when a specialist fits; keep `subagent` and `subagent_fork` for ad-hoc roles. Integrate member reports into your own answer.'
}

/** Merge base role policy with user-authored restrict-only denies. */
function memberFilter(member: AgentPresetRow, memberToolNames: readonly string[]): NonNullable<ToolSubagent.Config['toolFilter']> {
  const base = SHIPPED_FILTERS[member.id]
  const recursive = ['subagent', 'subagent_fork', ...memberToolNames]
  const deny = [...new Set([...base?.deny ?? [], ...member.tools, ...recursive])]
  return {
    ...base?.allow === undefined ? {} : { allow: [...base.allow] },
    deny,
  }
}

/** Mount one tool-subagent instance under its own disposable fiber. */
async function mountMember(
  ctx: Context,
  member: EffectiveMember,
  memberToolNames: readonly string[],
  fingerprint: string,
): Promise<MemberHandle> {
  const handle = ctx.plugin(ToolSubagent, {
    provider: 'spawn',
    toolName: `subagent_${member.id}`,
    backgroundMode: 'continuable',
    maxDepth: 0,
    persona: member.persona,
    toolFilter: memberFilter(member, memberToolNames),
  } satisfies ToolSubagent.Config)
  await handle.await()
  return { fingerprint, dispose: async () => { await handle.dispose() } }
}

/** Register roster guidance and keep member tools synchronized to committed writes. */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const handles = new Map<string, MemberHandle>()
  let guidance = ''
  let queue: Promise<void> = Promise.resolve()

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'squad:roster',
    order: FIRST_PARTY_SECTION_ORDER.SQUAD_ROSTER,
    text: () => guidance,
  }), 'squadRoster.guidance()')

  const reconcile = async (): Promise<void> => {
    const rows: readonly AgentPresetRow[] = config.frozen !== true
      ? (await ctx.squad.roster()).presets
      : frozenMembers(config).map(member => ({
        ...member,
        isDefault: false,
        squadMember: true,
        personaOverridden: false,
        revision: null,
      }))
    const members = rows
      .filter((member): member is EffectiveMember =>
        member.squadMember && member.broken === undefined && member.persona !== undefined)
      .sort(compareMembers)
    const toolNames = members.map(member => `subagent_${member.id}`)
    const nextIds = new Set(members.map(member => member.id))
    for (const [id, handle] of handles) {
      if (nextIds.has(id)) continue
      handles.delete(id)
      await handle.dispose()
    }
    for (const member of members) {
      const fingerprint = JSON.stringify({
        persona: member.persona,
        tools: member.tools,
        toolNames,
      })
      const prior = handles.get(member.id)
      if (prior?.fingerprint === fingerprint) continue
      if (prior !== undefined) {
        handles.delete(member.id)
        await prior.dispose()
      }
      handles.set(member.id, await mountMember(ctx, member, toolNames, fingerprint))
    }
    const nextGuidance = renderSquadGuidance(members)
    if (nextGuidance !== guidance) {
      guidance = nextGuidance
      ctx.emit('system-prompt/change')
    }
  }

  if (config.frozen !== true) {
    const enqueue = (): void => {
      queue = queue.then(reconcile, reconcile)
      void queue.catch((error: unknown) => {
        ctx.logger.error(`squad-roster: failed to reconcile member tools: ${String(error)}`)
      })
    }
    ctx.on('squad/change', enqueue)
  }
  ctx.effect(() => async () => {
    await queue.catch(() => undefined)
    await Promise.all([...handles.values()].map(async (handle) => { await handle.dispose() }))
    handles.clear()
  }, 'squadRoster.members()')
  await reconcile()
}

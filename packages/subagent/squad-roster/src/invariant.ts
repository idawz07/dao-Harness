/** Package-owned invariant companion for `@daoai/dao-squad-roster`. */

/* jscpd:ignore-start */
import type { Context } from '@daoai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@daoai/dao-invariants'
import type { PromptAssembly } from '@daoai/dao-system-prompt'

const PACKAGE_NAME = '@daoai/dao-squad-roster'

/** Cordis companion plugin name. */
export const name = 'squad-roster-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

const MEMBER_LINE = /^- .+ \([a-z0-9][a-z0-9-]*\): use `(subagent_[a-z0-9][a-z0-9-]*)`(?: — .*)?$/

/** Assert that every model-visible roster member has exactly one assembled tool schema. */
function validateRosterAssembly(assembly: PromptAssembly, fail: InvariantFailure): void {
  const sections = assembly.sections.filter(section => section.name === 'squad:roster')
  if (sections.length === 0) return
  if (sections.length > 1) fail('the authoritative prompt assembly contains duplicate squad:roster sections')
  const section = sections[0]
  if (section === undefined || section.text === '') return
  const lines = section.text.split('\n').filter(line => line.startsWith('- '))
  const memberTools = lines.map(line => MEMBER_LINE.exec(line)?.[1])
  if (memberTools.some(tool => tool === undefined)) {
    fail('every model-visible squad roster line must name its generated delegation tool')
  }
  const names = memberTools as string[]
  if (new Set(names).size !== names.length) {
    fail('model-visible squad roster lines must name distinct delegation tools')
  }
  const assembledTools = new Set(assembly.tools.map(tool => tool.name))
  const missing = names.filter(name => !assembledTools.has(name))
  if (missing.length > 0) {
    fail(`model-visible squad roster references missing tool schemas [${missing.join(', ')}]`)
  }
}

/** Validate roster guidance against the authoritative prompt assembly. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    validateRosterAssembly(assembled, fail)
    return assembled
  }, { global: true, prepend: true })
}, { inject: ['systemPrompt'] })

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */

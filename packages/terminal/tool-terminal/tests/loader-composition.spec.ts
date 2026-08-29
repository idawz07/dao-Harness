import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@daoai/cordis'
import Loader from '@daoai/cordis-plugin-loader'
import Include from '@daoai/cordis-plugin-include'
import { ToolCallId } from '@daoai/dao-llm'
import { Session, SessionId } from '@daoai/dao-session'
import AgentRegistry, { Inbox } from '@daoai/dao-agent'
import type { Agent } from '@daoai/dao-agent'
import SystemPrompt from '@daoai/dao-system-prompt'
import ToolRuntime from '@daoai/dao-tools'
import TerminalSessionService from '@daoai/dao-terminal'
import SandboxProvider from '@daoai/dao-sandbox'
import type { ConfinedArgv, SandboxPolicy } from '@daoai/dao-sandbox'
import SandboxPolicyService from '@daoai/dao-sandbox-policy'
import LocalSubprocessRuntime from '@daoai/dao-subprocess-local'
import * as TerminalLocal from '@daoai/dao-terminal-bash'
import * as ToolPty from '@daoai/dao-tool-terminal'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

class PassthroughSandbox extends SandboxProvider {
  confine(argv: readonly string[], _policy: SandboxPolicy): ConfinedArgv {
    return { argv: [...argv], enforcement: 'full', denialSignatures: [], runnerFailureRules: [] }
  }
}

function agent(ctx: Context): Agent {
  const scope = ctx.plugin(() => {})
  const id = SessionId('pty-loader-agent')
  const session = Session.create(id)
  const value: Agent = {
    id, options: {}, session, inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    ctx: scope.ctx,
    send: () => {},
    followup: () => {}, steer: () => {}, inject: () => {}, cancel() {},
    runMaintenance: job => job(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  ctx.agents.register(value)
  return value
}

function resultText(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

const suite = process.platform === 'linux' || process.platform === 'darwin' ? describe : describe.skip

suite('terminal real Loader composition through cordis.yml', () => {
  it('boots cordis.yml and preserves shell state across real tool calls', async () => {
    root = await mkdtemp(join(tmpdir(), 'dao-pty-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@daoai/dao-agent'",
      "- name: '@daoai/dao-system-prompt'",
      "- name: '@daoai/dao-tools'",
      "- name: '@daoai/dao-terminal'",
      "- name: '@daoai/dao-test-sandbox'",
      "- name: '@daoai/dao-sandbox-policy'",
      '  config:',
      '    mode: danger-full-access',
      `    workspaceRoot: ${JSON.stringify(root)}`,
      "- name: '@daoai/dao-subprocess-local'",
      "- name: '@daoai/dao-terminal-bash'",
      '  config:',
      '    pollIntervalMs: 10',
      '    exactProbeAfterMs: 20',
      '    idleSilenceMs: 250',
      '    handoffGraceMs: 250',
      '    timeoutMs: 2000',
      '    disposeGraceMs: 500',
      "- name: '@daoai/dao-tool-terminal'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@daoai/dao-agent', AgentRegistry],
      ['@daoai/dao-system-prompt', SystemPrompt],
      ['@daoai/dao-tools', ToolRuntime],
      ['@daoai/dao-terminal', TerminalSessionService],
      ['@daoai/dao-test-sandbox', PassthroughSandbox],
      ['@daoai/dao-sandbox-policy', SandboxPolicyService],
      ['@daoai/dao-subprocess-local', LocalSubprocessRuntime],
      ['@daoai/dao-terminal-bash', TerminalLocal],
      ['@daoai/dao-tool-terminal', ToolPty],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    const owner = agent(context)
    const signal = new AbortController().signal
    const spawn = await context.tools.execute({
      signal, callId: ToolCallId('spawn'), name: 'terminal_open', arguments: { type: 'shell', name: 'main', cwd: root }, agent: owner,
    })
    expect(resultText(spawn)).toContain('started terminal session pty-1 (main)')

    await context.tools.execute({
      signal, callId: ToolCallId('state'), name: 'terminal_send', arguments: { sessionId: 'pty-1', text: 'export KEEP=loader; cd /' }, agent: owner,
    })
    const read = await context.tools.execute({
      signal, callId: ToolCallId('read'), name: 'terminal_send', arguments: { sessionId: 'pty-1', text: 'printf "cwd=%s keep=%s\\n" "$PWD" "$KEEP"' }, agent: owner,
    })
    expect(resultText(read)).toContain('cwd=/ keep=loader')
    expect(context.terminals.list(owner)).toHaveLength(1)
  }, 15_000)
})

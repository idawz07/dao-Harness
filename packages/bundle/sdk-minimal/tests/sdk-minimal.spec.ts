/** The standalone SDK-minimal bundle's complete declared Cordis tree. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { entryListSchema } from '@daoai/cordis-plugin-include'

describe('dao-sdk-minimal bundle', () => {
  it('declares one standalone allowlisted tree with every row dependency', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dao?: { bundle?: { patch?: string } }
    }
    expect(manifest.dao?.bundle?.patch).toBe('./cordis.patch.yml')
    const patches = yaml.load(
      readFileSync(resolve(root, manifest.dao!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as Array<{ insert?: Array<{ id?: string; inject?: string[]; name?: string; config?: Record<string, unknown>; disabled?: unknown }> }>
    expect(patches).toHaveLength(1)
    const rows = patches[0]?.insert ?? []
    expect(rows.map(row => [row.id, row.name])).toEqual([
      ['sdk-app-startup', '@daoai/dao-sdk-app'],
      ['sdk-jsonrpc-server', '@daoai/dao-sdk-jsonrpc-server'],
      ['deepseek-llm-api-extensions', '@daoai/dao-deepseek-llm-api-extensions'],
      ['session-log-deepseek', '@daoai/dao-session-log-deepseek'],
      ['plugin-package-inventory-deepseek', '@daoai/dao-plugin-package-inventory-deepseek'],
      ['llm-deepseek', '@daoai/dao-llm-deepseek'],
      ['sandbox', '@daoai/dao-sandbox-local'],
      ['sandbox-policy', '@daoai/dao-sandbox-policy'],
      ['subprocess', '@daoai/dao-subprocess-local'],
      ['pty', '@daoai/dao-terminal'],
      ['terminal-bash', '@daoai/dao-terminal-bash'],
      ['terminal-pwsh', '@daoai/dao-terminal-bash'],
      ['fs-local', '@daoai/dao-fs-local'],
      ['agent-spine', '@daoai/dao-agent-spine-demo'],
      ['persistent-bash', '@daoai/dao-tool-bash-persistent'],
      ['persistent-pwsh', '@daoai/dao-tool-pwsh-persistent'],
      ['str-replace-editor', '@daoai/dao-tool-str-replace-editor'],
      ['sessions', '@daoai/dao-session-persistence-jsonl'],
    ])
    expect(rows.find(row => row.id === 'sdk-app-startup')?.config).toEqual({ profile: 'sdk-minimal' })
    expect(rows.find(row => row.id === 'sdk-jsonrpc-server')).toMatchObject({
      inject: ['sdkAppStartup', 'loader'],
      config: { maxTokensAsSuccess: false },
    })
    expect(rows.find(row => row.id === 'llm-deepseek')?.config).toEqual({
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      defaultContextWindow: { __jsExpr: 'Number(process.env.DAO_CONTEXT_WINDOW ?? 1000000)' },
      streamIdleTimeoutMs: 172800000,
    })
    expect(rows.find(row => row.id === 'agent-spine')?.config).toMatchObject({
      includeHarnessIdentity: false,
      includeRuntimeContext: false,
      workspaceContext: false,
      skills: { enabled: false },
      toolBash: false,
      toolJobs: false,
    })
    expect(rows.find(row => row.id === 'terminal-bash')).toMatchObject({
      disabled: { __jsExpr: "process.platform === 'win32'" },
    })
    expect(rows.find(row => row.id === 'terminal-pwsh')).toMatchObject({
      disabled: { __jsExpr: "process.platform !== 'win32'" },
      config: { shellDialect: 'pwsh', timeoutMs: 300000 },
    })
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(
      [...new Set(rows.map(row => row.name).filter((name): name is string => name !== undefined))].sort(),
    )
  })
})

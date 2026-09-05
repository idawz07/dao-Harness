import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@daoai/cordis'
import Include from '@daoai/cordis-plugin-include'
import Loader from '@daoai/cordis-plugin-loader'
import Storage from '@daoai/dao-storage'
import * as StorageDomain from '@daoai/dao-storage-domain'
import * as StorageJson from '@daoai/dao-storage-json'
import SystemPrompt from '@daoai/dao-system-prompt'
import Tools from '@daoai/dao-tools'
import { ToolCallId } from '@daoai/dao-llm'
import ReferencesStore from '@daoai/dao-references'
import * as ToolReferences from '../src/index.ts'

let root: string | undefined
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot storage + references + tool-references through a real Loader composition. */
async function loadComposition(configPath: string): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(root as string).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@daoai/dao-storage', Storage],
    ['@daoai/dao-storage-json', StorageJson],
    ['@daoai/dao-storage-domain', StorageDomain],
    ['@daoai/dao-system-prompt', SystemPrompt],
    ['@daoai/dao-tools', Tools],
    ['@daoai/dao-references', ReferencesStore],
    ['@daoai/dao-tool-references', ToolReferences],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  const unloaded = [...ctx.loader.entries()]
    .filter(entry => entry.fiber === undefined && !entry.disabled)
    .map(entry => entry.options.name)
  expect(unloaded).toEqual([])
  return ctx
}

describe('tool-references through a real Loader composition', () => {
  it('registers tools and rounds trip reference_add → reference_search', async () => {
    root = await mkdtemp(join(tmpdir(), 'dao-tool-references-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@daoai/dao-storage'",
      "- name: '@daoai/dao-storage-json'",
      '  config:',
      `    root: ${JSON.stringify(join(root, 'storage'))}`,
      "- name: '@daoai/dao-storage-domain'",
      '  config:',
      '    backend: json',
      "- name: '@daoai/dao-system-prompt'",
      "- name: '@daoai/dao-tools'",
      '  config:',
      '    mode: native',
      "- name: '@daoai/dao-references'",
      "- name: '@daoai/dao-tool-references'",
      '',
    ].join('\n'))

    const ctx = await loadComposition(configPath)
    const names = ctx.tools.schemas().map(schema => schema.name).sort()
    expect(names).toEqual([
      'reference_add',
      'reference_get',
      'reference_index',
      'reference_list',
      'reference_remove',
      'reference_search',
    ])

    const addResult = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('add-1'),
      name: 'reference_add',
      arguments: { title: 'Notes', text: 'keyword alpha appears here for search' },
    })
    expect(addResult.isError).toBe(false)
    expect(addResult.content.some(block => block.type === 'text' && block.text.includes('Ingested'))).toBe(true)

    const searchResult = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: ToolCallId('search-1'),
      name: 'reference_search',
      arguments: { query: 'alpha' },
    })
    expect(searchResult.isError).toBe(false)
    const searchText = searchResult.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
    expect(searchText).toContain('alpha')
    expect(searchText).toContain('Notes')
  })
})

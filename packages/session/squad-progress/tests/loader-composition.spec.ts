/**
 * REAL-composition proof: session + projection + storage stack + squad-progress
 * boots through the Loader and serves the squadProgress key.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@daoai/cordis'
import Loader from '@daoai/cordis-plugin-loader'
import Include from '@daoai/cordis-plugin-include'
import SessionStore, { SessionId } from '@daoai/dao-session'
import SessionProjectionRegistry from '@daoai/dao-session-projection'
import Storage from '@daoai/dao-storage'
import * as StorageDomain from '@daoai/dao-storage-domain'
import * as StorageJson from '@daoai/dao-storage-json'
import SquadProgress from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function loadYaml(lines: readonly string[]): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dao-squad-progress-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [...lines, ''].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@daoai/dao-session', SessionStore],
    ['@daoai/dao-session-projection', SessionProjectionRegistry],
    ['@daoai/dao-storage', Storage],
    ['@daoai/dao-storage-json', StorageJson],
    ['@daoai/dao-storage-domain', StorageDomain],
    ['@daoai/dao-squad-progress', SquadProgress],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return context
}

describe('real Loader composition', () => {
  it('loads the squad-progress YAML shape and serves zero progress', async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), 'dao-squad-progress-store-'))
    try {
      const loaded = await loadYaml([
        "- name: '@daoai/dao-session'",
        "- name: '@daoai/dao-session-projection'",
        "- name: '@daoai/dao-storage'",
        "- name: '@daoai/dao-storage-json'",
        '  config:',
        `    root: ${JSON.stringify(storageRoot)}`,
        "- name: '@daoai/dao-storage-domain'",
        '  config:',
        '    backend: json',
        "- name: '@daoai/dao-squad-progress'",
      ])

      const unloaded = [...loaded.loader.entries()]
        .filter(entry => entry.fiber === undefined && !entry.disabled)
        .map(entry => entry.options.name)
      expect(unloaded).toEqual([])

      const session = loaded.sessions.create(SessionId('composed'))
      expect(loaded.sessionProjections.snapshot(session).values.squadProgress)
        .toEqual({ xp: 0, level: 1, badges: [] })
      expect(loaded.squadProgress).toBeDefined()
    } finally {
      await rm(storageRoot, { recursive: true, force: true })
    }
  })
})

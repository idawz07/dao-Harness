/** Tests for client package modes, dependency sections, and module requests. */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectClientPackageViolations,
  collectRuntimeSourcePackageUses,
  collectRuntimeSourceSpecifiers,
  collectSourcePackageUses,
  fixClientPackageManifests,
  readClientDeclarations,
  type ClientDeclaration,
  type ClientPackage,
  type ClientPackageFacts,
} from './verify-client-packages.ts'

const CORDIS = '@daoai/cordis'
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function declaration(
  short: string,
  fields: Partial<Omit<ClientDeclaration, 'name' | 'manifest'>> = {},
): ClientDeclaration {
  return {
    name: short.startsWith('@') ? short : '@daoai/dao-client-' + short,
    manifest: 'packages/client/' + short.replace(/^.*\//, '') + '/package.json',
    dynamic: true,
    external: [],
    inject: [],
    runtimeSourceUses: {},
    runtimeSourceSpecifiers: {},
    ...fields,
  }
}

function pkg(
  short: string,
  fields: Partial<Omit<ClientPackage, 'name' | 'manifest'>> = {},
): ClientPackage {
  return {
    ...declaration(short),
    staticLinked: false,
    sourceUses: {},
    runtimeSourceUses: {},
    dependencies: {},
    peerDependencies: { [CORDIS]: 'workspace:^' },
    devDependencies: { [CORDIS]: 'workspace:^' },
    ...fields,
  }
}

function facts(
  packages: readonly ClientPackage[],
  options: Partial<Omit<ClientPackageFacts, 'packages'>> = {},
): ClientPackageFacts {
  return {
    packages,
    declarations: options.declarations ?? packages,
    staticLinkedPackages: options.staticLinkedPackages ?? new Set(
      packages.filter(item => item.staticLinked).map(item => item.name),
    ),
    platformModules: options.platformModules ?? [],
    preloadedExternals: options.preloadedExternals ?? [],
    parserPreloadIds: options.parserPreloadIds
      ?? (options.preloadedExternals ?? []).map(value => value.replace(/\/client$/, '')),
    malformed: options.malformed ?? [],
  }
}

describe('source package uses', () => {
  it('counts type imports, module augmentations, dynamic imports, and JSX', () => {
    const uses = collectSourcePackageUses('feature.tsx', [
      "import type { A } from '@daoai/dao-a/subpath'",
      "declare module '@daoai/dao-client-ui-slots' {}",
      "const load = () => import('@daoai/dao-b/remote')",
      'export const view = <div />',
      "export type { Local } from './local.ts'",
    ].join('\n'))

    expect([...uses].sort()).toEqual([
      '@daoai/dao-a',
      '@daoai/dao-b',
      '@daoai/dao-client-ui-slots',
      'react',
    ])
    expect([...collectRuntimeSourcePackageUses('feature.tsx', [
      "import type { A } from '@daoai/dao-a/subpath'",
      "declare module '@daoai/dao-client-ui-slots' {}",
      "const load = () => import('@daoai/dao-b')",
      'export const view = <div />',
    ].join('\n'))].sort()).toEqual([
      '@daoai/dao-b',
      'react',
    ])
    expect([...collectRuntimeSourceSpecifiers('feature.tsx', [
      "import type { A } from '@daoai/dao-a/subpath'",
      "const load = () => import('@daoai/dao-b/remote')",
      'export const view = <div />',
    ].join('\n'))].sort()).toEqual([
      '@daoai/dao-b/remote',
      'react',
    ])
  })
})

describe('package modes', () => {
  it('accepts one dynamic package and one statically linked package', () => {
    const dynamic = pkg('feature')
    const shell = pkg('ui-slots', { dynamic: false, staticLinked: true })
    expect(collectClientPackageViolations(facts([dynamic, shell]))).toEqual([])
  })

  it('rejects a package with both modes or neither mode', () => {
    const both = pkg('both', { staticLinked: true })
    const neither = pkg('neither', { dynamic: false })
    const found = collectClientPackageViolations(facts([both, neither]))
    expect(found).toHaveLength(2)
    expect(found.join('\n')).toContain('must be dynamic or statically linked, not both')
    expect(found.join('\n')).toContain('has no supported client package mode')
  })

  it('requires seeded workspace packages to use staticLinked and preloads to name dynamic rows', () => {
    const slots = declaration('ui-slots', { dynamic: false })
    const bootstrap = declaration('bootstrap', { dynamic: false })
    const found = collectClientPackageViolations(facts([], {
      declarations: [slots, bootstrap],
      platformModules: [slots.name],
      preloadedExternals: [bootstrap.name + '/client'],
    }))
    expect(found).toHaveLength(2)
    expect(found.join('\n')).toContain('does not use the staticLinked preset')
    expect(found.join('\n')).toContain('has no dynamic dao.client row')
  })

  it('requires every preloaded external to have a parser preload row', () => {
    const bootstrap = declaration('bootstrap')
    expect(collectClientPackageViolations(facts([], {
      declarations: [bootstrap],
      preloadedExternals: [bootstrap.name + '/client'],
      parserPreloadIds: [],
    }))).toEqual([
      'packages/client/web/src/platform.ts: parser-preloaded external '
      + '"@daoai/dao-client-bootstrap/client" has no matching PARSER_PRELOAD_IDS row in '
      + 'packages/client/modules/src/index.ts',
    ])
  })
})

describe('dependency sections', () => {
  it('accepts dynamic peer plus dev relationships, static dev inputs, and private dependencies', () => {
    const slots = pkg('ui-slots', { dynamic: false, staticLinked: true })
    const conversation = pkg('conversation', {
      inject: ['@daoai/dao-client-feature'],
      sourceUses: {
        '@daoai/dao-agent': ['packages/client/conversation/src/index.ts'],
        '@daoai/dao-client-ui-slots': ['packages/client/conversation/src/client/slots.ts'],
        react: ['packages/client/conversation/src/client/view.tsx'],
      },
      dependencies: { immer: '^10.1.1' },
      peerDependencies: {
        [CORDIS]: 'workspace:^',
        '@daoai/dao-agent': 'workspace:^',
        '@daoai/dao-client-feature': 'workspace:^',
      },
      devDependencies: {
        [CORDIS]: 'workspace:^',
        '@daoai/dao-agent': 'workspace:^',
        '@daoai/dao-client-feature': 'workspace:^',
        '@daoai/dao-client-ui-slots': 'workspace:^',
        react: '^18.2.0',
      },
    })
    expect(collectClientPackageViolations(facts([slots, conversation], {
      platformModules: ['react', slots.name],
    }))).toEqual([])
  })

  it('rejects internal dependencies, static peers, and mismatched peer development ranges', () => {
    const slots = pkg('ui-slots', { dynamic: false, staticLinked: true })
    const subject = pkg('feature', {
      sourceUses: {
        '@daoai/dao-agent': ['packages/client/feature/src/index.ts'],
        [slots.name]: ['packages/client/feature/src/view.tsx'],
      },
      dependencies: { '@daoai/dao-agent': 'workspace:^' },
      peerDependencies: { [CORDIS]: 'workspace:^', [slots.name]: 'workspace:^' },
      devDependencies: { [CORDIS]: 'workspace:^', [slots.name]: 'workspace:*' },
    })
    const found = collectClientPackageViolations(facts([slots, subject]))
    expect(found).toHaveLength(2)
    expect(found.join('\n')).toContain('peer-installed DAO relationship')
    expect(found.join('\n')).toContain('static client input')
  })

  it('requires every peer to have the same development range', () => {
    const subject = pkg('feature', {
      peerDependencies: { [CORDIS]: 'workspace:^', '@daoai/cordis-plugin-loader': 'workspace:^' },
    })
    expect(collectClientPackageViolations(facts([subject]))).toEqual([
      'packages/client/feature/package.json: peerDependencies.@daoai/cordis-plugin-loader'
      + ' is workspace:^, so devDependencies.@daoai/cordis-plugin-loader must use the same range;'
      + ' found no declaration',
    ])
  })

  it('requires statically linked third-party runtime imports in dependencies', () => {
    const primitives = pkg('ui-primitives', {
      dynamic: false,
      staticLinked: true,
      runtimeSourceUses: { shiki: ['packages/client/ui-primitives/src/highlight.ts'] },
      devDependencies: { [CORDIS]: 'workspace:^', shiki: '^4.3.1' },
    })
    const found = collectClientPackageViolations(facts([primitives]))
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('runtime import retained by a statically linked artifact')
    expect(found[0]).toContain('declare it only in dependencies')

    const valid = { ...primitives, dependencies: { shiki: '^4.3.1' }, devDependencies: { [CORDIS]: 'workspace:^' } }
    expect(collectClientPackageViolations(facts([valid]))).toEqual([])
  })

  it('keeps the web shell runtime inputs development-only', () => {
    const web = pkg('web', {
      dynamic: false,
      staticLinked: true,
      runtimeSourceUses: {
        '@daoai/cordis-plugin-loader': ['packages/client/web/src/boot.ts'],
        react: ['packages/client/web/src/seed.ts'],
      },
      devDependencies: {
        [CORDIS]: 'workspace:^',
        '@daoai/cordis-plugin-loader': 'workspace:^',
        react: '^18.2.0',
      },
    })
    expect(collectClientPackageViolations(facts([web]))).toEqual([])
  })

  it('allows npm dependency cycles', () => {
    const a = pkg('a', {
      peerDependencies: { [CORDIS]: 'workspace:^', '@daoai/dao-client-b': 'workspace:^' },
      devDependencies: { [CORDIS]: 'workspace:^', '@daoai/dao-client-b': 'workspace:^' },
    })
    const b = pkg('b', {
      peerDependencies: { [CORDIS]: 'workspace:^', '@daoai/dao-client-a': 'workspace:^' },
      devDependencies: { [CORDIS]: 'workspace:^', '@daoai/dao-client-a': 'workspace:^' },
    })
    expect(collectClientPackageViolations(facts([a, b]))).toEqual([])
  })
})

describe('module requests', () => {
  it('rejects runtime requests from one client feature package to another dynamic row', () => {
    const ui = declaration('ui', {
      external: ['@daoai/dao-client-slots/client'],
      runtimeSourceUses: {
        '@daoai/dao-client-slots': ['packages/client/ui/src/client/index.ts'],
      },
    })
    const slots = declaration('slots')
    expect(collectClientPackageViolations(facts([], { declarations: [ui, slots] }))).toEqual([
      ui.manifest + ': client feature package requests runtime external '
      + '"@daoai/dao-client-slots/client"; import shared types only or call an injected Cordis service',
    ])
  })

  it('rejects stale externals and accepts a runtime import outside client feature packages', () => {
    const gateway = {
      ...declaration('@daoai/dao-api-gateway'), manifest: 'packages/api/gateway/package.json',
    }
    const stale = { ...declaration('@daoai/dao-api-stale', {
      external: ['@daoai/dao-api-gateway/client'],
    }), manifest: 'packages/api/stale/package.json' }
    const live = { ...declaration('@daoai/dao-api-live', {
      external: ['@daoai/dao-api-gateway/client'],
      runtimeSourceUses: {
        '@daoai/dao-api-gateway': ['packages/api/live/src/client/index.ts'],
      },
      runtimeSourceSpecifiers: {
        '@daoai/dao-api-gateway/client': ['packages/api/live/src/client/index.ts'],
      },
    }), manifest: 'packages/api/live/package.json' }
    expect(collectClientPackageViolations(facts([], {
      declarations: [gateway, stale, live],
    }))).toEqual([
      stale.manifest + ': dao.client.external "@daoai/dao-api-gateway/client"'
      + ' has no runtime import or re-export in production source; remove the stale declaration',
    ])
  })

  it('requires the exact external subpath to be imported at runtime', () => {
    const gateway = {
      ...declaration('@daoai/dao-api-gateway'), manifest: 'packages/api/gateway/package.json',
    }
    const subject = { ...declaration('@daoai/dao-api-session-controller', {
      external: ['@daoai/dao-api-gateway/client'],
      runtimeSourceUses: {
        '@daoai/dao-api-gateway': ['packages/api/session-controller/src/client/index.ts'],
      },
      runtimeSourceSpecifiers: {
        '@daoai/dao-api-gateway/remote': ['packages/api/session-controller/src/client/index.ts'],
      },
    }), manifest: 'packages/api/session-controller/package.json' }
    expect(collectClientPackageViolations(facts([], { declarations: [gateway, subject] }))).toEqual([
      subject.manifest + ': dao.client.external "@daoai/dao-api-gateway/client"'
      + ' has no runtime import or re-export in production source; remove the stale declaration',
    ])
  })

  it('rejects an explicit baseline request', () => {
    const ui = declaration('ui', { external: ['react'] })
    expect(collectClientPackageViolations(facts([], {
      declarations: [ui],
      platformModules: ['react'],
    }))).toEqual([
      ui.manifest + ': dao.client.external repeats baseline module "react"; remove the explicit declaration',
    ])
  })

  it('rejects duplicates, empty values, self-requests, and missing suppliers', () => {
    const ui = declaration('ui', {
      external: ['', '@daoai/dao-client-ui', '@daoai/dao-missing', '@daoai/dao-missing'],
      inject: ['', '@daoai/dao-a', '@daoai/dao-a'],
    })
    const found = collectClientPackageViolations(facts([], { declarations: [ui] }))
    expect(found).toHaveLength(6)
    expect(found.join('\n')).toContain('dao.client.external contains an empty value')
    expect(found.join('\n')).toContain('dao.client.inject contains an empty value')
    expect(found.join('\n')).toContain('names its own row')
    expect(found.join('\n')).toContain('has no supplier')
  })

  it('rejects synchronous module-request cycles but ignores inject cycles', () => {
    const a = { ...declaration('@daoai/dao-api-a', {
      external: ['@daoai/dao-api-b'],
      inject: ['@daoai/dao-api-b'],
      runtimeSourceUses: { '@daoai/dao-api-b': ['packages/api/a/src/client.ts'] },
      runtimeSourceSpecifiers: { '@daoai/dao-api-b': ['packages/api/a/src/client.ts'] },
    }), manifest: 'packages/api/a/package.json' }
    const b = { ...declaration('@daoai/dao-api-b', {
      external: ['@daoai/dao-api-a'],
      inject: ['@daoai/dao-api-a'],
      runtimeSourceUses: { '@daoai/dao-api-a': ['packages/client/b/src/client.ts'] },
      runtimeSourceSpecifiers: { '@daoai/dao-api-a': ['packages/client/b/src/client.ts'] },
    }), manifest: 'packages/api/b/package.json' }
    const found = collectClientPackageViolations(facts([], { declarations: [a, b] }))
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('synchronous dao.client.external cycle')
  })
})

describe('manifest declarations', () => {
  it('reports malformed arrays without hiding other packages', () => {
    const root = mkdtempSync(join(tmpdir(), 'client-packages-'))
    roots.push(root)
    const files: Record<string, unknown> = {
      'packages/g/a/package.json': {
        name: '@f/a', dao: { client: { external: 'react', inject: ['@f/b', 1] } },
      },
      'packages/g/b/package.json': { name: '@f/b', dao: { client: {} } },
    }
    for (const [path, value] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), JSON.stringify(value))
    }

    const result = readClientDeclarations(root)
    expect(result.declarations).toHaveLength(2)
    expect(result.malformed).toEqual([
      'packages/g/a/package.json: @f/a dao.client.external must be a string array',
      'packages/g/a/package.json: @f/a dao.client.inject must be a string array',
    ])
  })

  it('fixes unambiguous dependency sections and declaration entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'client-packages-fix-'))
    roots.push(root)
    const subject = pkg('feature', {
      external: ['', 'react', '@daoai/dao-client-feature', '@daoai/dao-missing'],
      inject: ['', '@daoai/dao-agent', '@daoai/dao-agent'],
      sourceUses: {
        '@daoai/dao-agent': ['packages/client/feature/src/index.ts'],
        '@daoai/dao-client-ui-slots': ['packages/client/feature/src/view.tsx'],
      },
      dependencies: {
        [CORDIS]: 'workspace:^',
        '@daoai/dao-agent': 'workspace:*',
      },
      peerDependencies: {
        '@daoai/dao-client-ui-slots': 'workspace:^',
        '@daoai/cordis-plugin-loader': 'workspace:^',
      },
      devDependencies: {},
    })
    const slots = declaration('ui-slots', { dynamic: false })
    const manifest = {
      name: subject.name,
      dao: { client: { external: subject.external, inject: subject.inject, platform: 'web' } },
      dependencies: subject.dependencies,
      peerDependencies: subject.peerDependencies,
      devDependencies: subject.devDependencies,
    }
    mkdirSync(dirname(join(root, subject.manifest)), { recursive: true })
    writeFileSync(join(root, subject.manifest), JSON.stringify(manifest))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true }))

    expect(fixClientPackageManifests(root, facts([subject], {
      declarations: [subject, slots],
      staticLinkedPackages: new Set([slots.name]),
      platformModules: ['react', slots.name],
    }))).toEqual([subject.manifest])

    const fixed = JSON.parse(readFileSync(join(root, subject.manifest), 'utf8')) as {
      dao: { client: { external: string[]; inject: string[] } }
      dependencies?: Record<string, string>
      peerDependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(fixed.dao.client).toMatchObject({
      external: ['@daoai/dao-missing'],
      inject: ['@daoai/dao-agent'],
    })
    expect(fixed.dependencies).toBeUndefined()
    expect(fixed.peerDependencies).toEqual({
      '@daoai/cordis-plugin-loader': 'workspace:^',
      [CORDIS]: 'workspace:^',
      '@daoai/dao-agent': 'workspace:*',
    })
    expect(fixed.devDependencies).toEqual({
      '@daoai/dao-client-ui-slots': 'workspace:^',
      [CORDIS]: 'workspace:^',
      '@daoai/dao-agent': 'workspace:*',
      '@daoai/cordis-plugin-loader': 'workspace:^',
    })
  })

  it('fixes a statically linked runtime import into dependencies', () => {
    const root = mkdtempSync(join(tmpdir(), 'client-packages-static-fix-'))
    roots.push(root)
    const subject = pkg('ui-primitives', {
      dynamic: false,
      staticLinked: true,
      runtimeSourceUses: { shiki: ['packages/client/ui-primitives/src/highlight.ts'] },
      devDependencies: { [CORDIS]: 'workspace:^', shiki: '^4.3.1' },
    })
    mkdirSync(dirname(join(root, subject.manifest)), { recursive: true })
    writeFileSync(join(root, subject.manifest), JSON.stringify({
      name: subject.name,
      peerDependencies: subject.peerDependencies,
      devDependencies: subject.devDependencies,
    }))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true }))

    expect(fixClientPackageManifests(root, facts([subject]))).toEqual([subject.manifest])
    const fixed = JSON.parse(readFileSync(join(root, subject.manifest), 'utf8')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(fixed.dependencies).toEqual({ shiki: '^4.3.1' })
    expect(fixed.devDependencies).toEqual({ [CORDIS]: 'workspace:^' })
  })
})

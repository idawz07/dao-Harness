/** Release family discovery, publish order, tag naming, and the bump judgements. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { officialClientBuildEnvironment, writeClientBuildRecord } from '../client-build-environment.ts'
import { releaseFamily, type ReleaseMember } from './families.ts'
import { compareVersions, nextVendorVersion, planShared, reachesPayload } from './bump.ts'

/**
 * A release member standing in for a manifest on disk.
 * @param directory - repository-relative package directory.
 * @param name - package name.
 * @param manifest - manifest fields the subject reads.
 * @returns The member.
 */
function member(directory: string, name: string, manifest: Record<string, unknown> = {}): ReleaseMember {
  return { directory, name, version: '0.0.1', manifest }
}

const roots: string[] = []

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function buildFixture(environment: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'dao-release-build-'))
  roots.push(root)
  write(join(root, 'package.json'), `${JSON.stringify({ version: environment.DAO_CLIENT_VERSION ?? '0.0.1' })}\n`)
  write(join(root, 'apps/web/dist/index.html'), '<main></main>')
  write(join(root, 'packages/client/example/lib/client.js'), 'module.exports = {}\n')
  writeClientBuildRecord(root, environment)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('release families', () => {
  it('excludes private experimental packages from the dao release', () => {
    const members = releaseFamily('dao').members(resolve(import.meta.dirname, '../..'))

    expect(members.some(member => member.directory.startsWith('packages/experimental/'))).toBe(false)
    expect(members.map(member => member.name)).not.toContain('@daoai/dao-experimental-agent-team')
  })

  it('bumps private dao packages without adding release tags', () => {
    const root = mkdtempSync(join(tmpdir(), 'dao-release-version-'))
    roots.push(root)
    write(join(root, 'package.json'), '{"version":"0.0.1"}\n')
    write(join(root, 'packages/experimental/prototype/package.json'), '{"version":"0.0.1","private":true}\n')
    write(join(root, 'packages/core/unselected/package.json'), '{"version":"0.0.1"}\n')

    const dao = releaseFamily('dao')
    const published = member('packages/core/published', '@daoai/dao-published')
    const { planned } = planShared(dao, root, [published], '0.0.2')

    expect(planned.map(entry => ({ path: entry.manifestPath, tag: entry.tag }))).toEqual([
      { path: 'package.json', tag: undefined },
      { path: 'packages/core/published/package.json', tag: 'dao-v0.0.2' },
      { path: 'packages/experimental/prototype/package.json', tag: undefined },
    ])
  })

  it('names one tag for the whole dao family and one per vendored package', () => {
    const dao = releaseFamily('dao')
    const vendor = releaseFamily('vendor')
    const cli = member('apps/cli', '@daoai/dao')
    const cordis = { ...member('vendor/cordis', '@daoai/cordis'), version: '4.0.1' }

    expect(dao.tagFor(cli)).toBe('dao-v0.0.1')
    expect(vendor.tagFor(cordis)).toBe('vendor-cordis-v4.0.1')
    // The prefix is constructed, not recovered from a tag: a version with a
    // hyphen would defeat any suffix-stripping.
    expect(vendor.tagPrefixFor({ ...cordis, version: '4.0.0-rc.7' })).toBe('vendor-cordis-v')
    expect(vendor.tagFor({ ...cordis, version: '4.0.0-rc.7' })).toBe('vendor-cordis-v4.0.0-rc.7')
  })

  it('rejects a family whose members disagree on the shared version', () => {
    const dao = releaseFamily('dao')
    const members = [member('apps/cli', '@daoai/dao'), { ...member('apps/web', '@daoai/dao-web-frontend'), version: '0.0.2' }]

    expect(() => { dao.verifyVersions(members) }).toThrow(/must share one version/)
    expect(() => { dao.verifyVersions([members[0]!]) }).not.toThrow()
  })

  it('accepts independent vendored versions and rejects an unpublishable one', () => {
    const vendor = releaseFamily('vendor')
    const members = [
      { ...member('vendor/cordis', '@daoai/cordis'), version: '4.0.1' },
      { ...member('vendor/cosmokit', '@daoai/cosmokit'), version: '1.8.2' },
    ]

    expect(() => { vendor.verifyVersions(members) }).not.toThrow()
    expect(() => { vendor.verifyVersions([{ ...members[0]!, version: 'latest' }]) }).toThrow(/unpublishable version/)
  })

  it('requires a current official client build only for dao artifacts', () => {
    const dao = releaseFamily('dao')
    const vendor = releaseFamily('vendor')
    const officialEnvironment = officialClientBuildEnvironment(resolve(import.meta.dirname, '../..'))
    vi.stubEnv('DAO_CLIENT_COMMIT_HASH', officialEnvironment.DAO_CLIENT_COMMIT_HASH)
    const official = buildFixture(officialEnvironment)
    const defaultBuild = buildFixture({})
    const missing = join(defaultBuild, 'missing')
    write(join(missing, 'package.json'), `${JSON.stringify({ version: officialEnvironment.DAO_CLIENT_VERSION })}\n`)

    expect(() => { dao.verifyBuildArtifacts(official) }).not.toThrow()
    expect(() => { dao.verifyBuildArtifacts(defaultBuild) }).toThrow(/DAO_CLIENT_TITLE/)
    expect(() => { dao.verifyBuildArtifacts(missing) }).toThrow(/record.*missing/)
    expect(() => { vendor.verifyBuildArtifacts(missing) }).not.toThrow()

    write(join(official, 'packages/client/example/lib/client.js'), 'module.exports = { changed: true }\n')
    expect(() => { dao.verifyBuildArtifacts(official) }).toThrow(/artifacts differ/)
  })

  it('publishes a dependency before its consumer, and orders ties by name', () => {
    const dao = releaseFamily('dao')
    const members = [
      member('packages/a/consumer', '@daoai/dao-consumer', { dependencies: { '@daoai/dao-library': 'workspace:^' } }),
      member('packages/a/library', '@daoai/dao-library'),
      member('packages/a/zebra', '@daoai/dao-zebra'),
    ]

    expect(dao.publishOrder(members).order.map(entry => entry.name)).toEqual([
      '@daoai/dao-library',
      '@daoai/dao-consumer',
      '@daoai/dao-zebra',
    ])
  })

  it('reports a runtime dependency cycle instead of emitting an arbitrary order', () => {
    const dao = releaseFamily('dao')
    const members = [
      member('packages/a/left', '@daoai/dao-left', { dependencies: { '@daoai/dao-right': 'workspace:^' } }),
      member('packages/a/right', '@daoai/dao-right', { dependencies: { '@daoai/dao-left': 'workspace:^' } }),
    ]

    expect(() => { dao.publishOrder(members) }).toThrow(/dependency cycle/)
  })

  it('publishes a peer before its consumer', () => {
    const dao = releaseFamily('dao')
    const members = [
      member('packages/a/consumer', '@daoai/dao-consumer', { peerDependencies: { '@daoai/dao-zebra': 'workspace:^' } }),
      member('packages/a/zebra', '@daoai/dao-zebra'),
    ]

    // Name order alone would place the consumer first; the peer edge moves it.
    expect(dao.publishOrder(members).order.map(entry => entry.name)).toEqual([
      '@daoai/dao-zebra',
      '@daoai/dao-consumer',
    ])
  })

  it('orders around a peer cycle rather than refusing to publish, and reports the edge it dropped', () => {
    const dao = releaseFamily('dao')
    const members = [
      member('packages/a/left', '@daoai/dao-left', { peerDependencies: { '@daoai/dao-right': 'workspace:^' } }),
      member('packages/a/right', '@daoai/dao-right', { peerDependencies: { '@daoai/dao-left': 'workspace:^' } }),
    ]

    // Sibling packages declare each other as peers, and npm treats an unmet peer
    // as a warning, so this pair has to publish rather than fail the release.
    const plan = dao.publishOrder(members)
    expect(plan.order.map(entry => entry.name)).toEqual([
      '@daoai/dao-right',
      '@daoai/dao-left',
    ])
    // One of the two edges has to give, and which one it is belongs in the log.
    expect(plan.droppedPeerEdges).toEqual([
      { consumer: '@daoai/dao-right', peer: '@daoai/dao-left' },
    ])
  })

  it('honours an install edge even when a peer cycle surrounds it', () => {
    const dao = releaseFamily('dao')
    const members = [
      member('packages/a/base', '@daoai/dao-base', { peerDependencies: { '@daoai/dao-consumer': 'workspace:^' } }),
      member('packages/a/consumer', '@daoai/dao-consumer', {
        dependencies: { '@daoai/dao-base': 'workspace:^' },
        peerDependencies: { '@daoai/dao-base': 'workspace:^' },
      }),
    ]

    // The install edge is absolute: base publishes first, and the peer edge that
    // would reverse it is the one dropped.
    const plan = dao.publishOrder(members)
    expect(plan.order.map(entry => entry.name)).toEqual([
      '@daoai/dao-base',
      '@daoai/dao-consumer',
    ])
    expect(plan.droppedPeerEdges).toEqual([
      { consumer: '@daoai/dao-base', peer: '@daoai/dao-consumer' },
    ])
  })

  it('refuses an order that would publish a consumer before a dependency it installs', () => {
    const dao = releaseFamily('dao')
    const members = [
      member('packages/a/alpha', '@daoai/dao-alpha', { peerDependencies: { '@daoai/dao-bravo': 'workspace:^' } }),
      member('packages/a/bravo', '@daoai/dao-bravo', { peerDependencies: { '@daoai/dao-charlie': 'workspace:^' } }),
      member('packages/a/charlie', '@daoai/dao-charlie', { dependencies: { '@daoai/dao-alpha': 'workspace:^' } }),
    ]

    // A cycle of two peer edges closed by one install edge: dropping a peer edge
    // would order this, and the traversal drops the install edge instead. That
    // order would publish charlie before the alpha it installs, so it is refused
    // here rather than published.
    expect(() => { dao.publishOrder(members) }).toThrow(/no publish order honours @daoai\/dao-charlie -> @daoai\/dao-alpha/)
  })

  it('ignores devDependencies when ordering', () => {
    const dao = releaseFamily('dao')
    const members = [
      member('packages/a/alpha', '@daoai/dao-alpha', { devDependencies: { '@daoai/dao-zebra': 'workspace:^' } }),
      member('packages/a/zebra', '@daoai/dao-zebra'),
    ]

    // A dev dependency is absent from the published package, so it must not move
    // the consumer behind it.
    expect(dao.publishOrder(members).order.map(entry => entry.name)).toEqual([
      '@daoai/dao-alpha',
      '@daoai/dao-zebra',
    ])
  })

  it('applies the harness payload policy to dao and keeps upstream payloads for vendored packages', () => {
    const dao = releaseFamily('dao')
    const vendor = releaseFamily('vendor')
    const harness = member('packages/a/library', '@daoai/dao-library')
    const vendored = member('vendor/cordis', '@daoai/cordis')

    expect(() => { dao.validatePayload(harness, ['package/lib/index.js', 'package/src/index.ts']) })
      .toThrow(/publishes source file/)
    expect(() => { vendor.validatePayload(vendored, ['package/lib/index.js', 'package/src/index.ts']) }).not.toThrow()
    expect(() => { vendor.validatePayload(vendored, []) }).toThrow(/empty tarball/)
  })

  it('drives the installed entry only for the family that publishes one', () => {
    expect(releaseFamily('dao').installedEntry).toEqual({ packageName: '@daoai/dao', binPath: 'lib/bin.js' })
    expect(releaseFamily('vendor').installedEntry).toBeUndefined()
  })

  it('rejects an unknown family identifier', () => {
    expect(() => { releaseFamily('native') }).toThrow(/unknown release family/)
  })
})

describe('vendored version baseline', () => {
  it('drops an upstream prerelease segment and increments the patch', () => {
    expect(nextVendorVersion('4.0.0-rc.7', undefined)).toBe('4.0.1')
    expect(nextVendorVersion('1.0.0-rc.5', undefined)).toBe('1.0.1')
    expect(nextVendorVersion('1.8.1', undefined)).toBe('1.8.2')
  })

  it('increments from the last published version when a re-sync restored a lower one', () => {
    // Upstream moved rc.7 -> rc.8 after this repository published 4.0.1;
    // incrementing the manifest alone would name 4.0.1 a second time.
    expect(nextVendorVersion('4.0.0-rc.8', '4.0.1')).toBe('4.0.2')
    expect(nextVendorVersion('4.1.0', '4.0.1')).toBe('4.1.1')
  })

  it('appends a rehearsal prerelease without consuming its release numbers', () => {
    // A rehearsal burns 4.0.1-rc.1 and leaves 4.0.1 free, so the stable release
    // that follows takes those same numbers instead of skipping to 4.0.2.
    expect(nextVendorVersion('4.0.0-rc.7', undefined, 'rc.1')).toBe('4.0.1-rc.1')
    expect(nextVendorVersion('4.0.0-rc.7', '4.0.1-rc.1', 'rc.2')).toBe('4.0.1-rc.2')
    expect(nextVendorVersion('4.0.0-rc.7', '4.0.1-rc.1')).toBe('4.0.1')
    expect(nextVendorVersion('4.0.0-rc.7', '4.0.1')).toBe('4.0.2')
  })
})

describe('version precedence', () => {
  it('ranks a release above the prerelease it follows', () => {
    // git --sort=v:refname disagrees, placing 4.0.1-rc.1 above 4.0.1, which is
    // why the newest published version is chosen here rather than by git.
    expect(compareVersions('4.0.1', '4.0.1-rc.1')).toBeGreaterThan(0)
    expect(compareVersions('4.0.1-rc.1', '4.0.1')).toBeLessThan(0)
  })

  it('compares numeric prerelease fields numerically', () => {
    expect(compareVersions('4.0.1-rc.10', '4.0.1-rc.1')).toBeGreaterThan(0)
    expect(compareVersions('4.0.1-rc.2', '4.0.1-rc.10')).toBeLessThan(0)
  })

  it('ranks a numeric field below an alphanumeric one, and a shorter list below a longer', () => {
    expect(compareVersions('4.0.1-1', '4.0.1-alpha')).toBeLessThan(0)
    expect(compareVersions('4.0.1-rc', '4.0.1-rc.1')).toBeLessThan(0)
    expect(compareVersions('4.0.2', '4.0.1')).toBeGreaterThan(0)
    expect(compareVersions('4.0.1-rc.1', '4.0.1-rc.1')).toBe(0)
  })
})

describe('payload change judgement', () => {
  const sourceShipping = member('vendor/cosmokit', '@daoai/cosmokit', {
    files: ['lib/index.js', 'lib/types/**/*.d.ts', 'src'],
  })
  const buildOutputOnly = member('vendor/cordis', '@daoai/cordis', {
    files: ['lib/index.js', 'lib/types/**/*.d.ts', 'bin.js'],
  })

  it('counts the manifest and the files npm always publishes', () => {
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/package.json')).toBe(true)
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/README.md')).toBe(true)
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/src/index.ts')).toBe(true)
  })

  it('counts build inputs for a package whose payload is build output', () => {
    // cordis publishes lib/ only, and lib/ is not tracked: without this, a real
    // source change reads as "nothing changed" and the next publish fails on a
    // version whose bytes moved.
    expect(reachesPayload(buildOutputOnly, 'vendor/cordis/src/context.ts')).toBe(true)
    expect(reachesPayload(buildOutputOnly, 'vendor/cordis/tsconfig.json')).toBe(true)
  })

  it('ignores paths no tarball carries', () => {
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/tests/unit.spec.ts')).toBe(false)
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/CHANGELOG.md')).toBe(false)
    // The README pattern is deliberately loose: over-reporting a change costs one
    // unnecessary patch bump, while under-reporting fails the next publish on a
    // version whose bytes moved.
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/README.i18n.yaml')).toBe(true)
    expect(reachesPayload(member('packages/a/library', '@daoai/dao-library', { files: ['lib/index.js'] }),
      'packages/a/library/tests/library.spec.ts')).toBe(false)
  })
})

/**
 * The identity, timestamp, link, mutation, and durability-sink guarantees
 * MemoryVfs owes its consumers, asserted directly rather than through the
 * `node:fs` bridge.
 *
 * `dao-fs-local` builds a version token from `dev:ino:size:mtimeNs:ctimeNs` and
 * refuses a write whose token moved since it read. Two properties carry that:
 * `ino` identifies the entry at a path, and `mtimeMs` moves on every write. The
 * timestamp cases freeze the clock, because these writes are in memory and two
 * revisions routinely land in the same millisecond — a real-clock test passes
 * whether or not the strict increment exists.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryVfs } from '../../src/storage/memory.ts'
import type { VfsBigIntStats, VfsMutation, VfsMutationSink, VfsStats } from '../../src/storage/types.ts'

const identity = (vfs: MemoryVfs, path: string): bigint =>
  (vfs.statSync(path, { bigint: true }) as VfsBigIntStats).ino

const linkCount = (vfs: MemoryVfs, path: string): bigint =>
  (vfs.statSync(path, { bigint: true }) as VfsBigIntStats).nlink

const modified = (vfs: MemoryVfs, path: string): number => (vfs.statSync(path) as VfsStats).mtimeMs

afterEach(() => { vi.restoreAllMocks() })

describe('entry identity', () => {
  it('distinguishes paths and holds each identity across repeated stats', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/dao/one.txt', 'one')
    vfs.seed('/dao/two.txt', 'two')
    const first = identity(vfs, '/dao/one.txt')
    expect(identity(vfs, '/dao/two.txt')).not.toBe(first)
    expect(identity(vfs, '/dao/one.txt')).toBe(first)
  })

  it('forgets the identities under a directory removed as a subtree', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/dao/skills/git/SKILL.md', '# git\n')
    const before = identity(vfs, '/dao/skills/git/SKILL.md')
    vfs.rmSync('/dao/skills', { recursive: true })
    vfs.seed('/dao/skills/git/SKILL.md', '# git rebuilt\n')
    expect(identity(vfs, '/dao/skills/git/SKILL.md')).not.toBe(before)
  })

  it('moves the source identity when a file replaces another path', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/dao/from.txt', 'moved')
    vfs.seed('/dao/to.txt', 'replaced')
    const [source, destination] = [identity(vfs, '/dao/from.txt'), identity(vfs, '/dao/to.txt')]
    vfs.renameSync('/dao/from.txt', '/dao/to.txt')
    const renamed = identity(vfs, '/dao/to.txt')
    expect(vfs.readFileSync('/dao/to.txt', 'utf8')).toBe('moved')
    expect([renamed === source, renamed === destination]).toEqual([true, false])
  })
})

describe('modification time', () => {
  it('hydrates explicit metadata without confusing timestamps with permission bits', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/dao/restored', 'value', { mode: 0o600, mtimeMs: 1_600_000_000_000 })
    vfs.seedDirectory('/dao/restored-directory', { mode: 0o700, mtimeMs: 1_600_000_000_001 })
    const stats = vfs.statSync('/dao/restored') as VfsStats
    const directory = vfs.statSync('/dao/restored-directory') as VfsStats
    expect([stats.mode & 0o777, stats.mtimeMs]).toEqual([0o600, 1_600_000_000_000])
    expect([directory.mode & 0o777, directory.mtimeMs]).toEqual([0o700, 1_600_000_000_001])
  })

  it('advances on every write even while the clock stands still', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seed('/dao/log.jsonl', 'first\n')
    const seeded = modified(vfs, '/dao/log.jsonl')
    vfs.writeFileSync('/dao/log.jsonl', 'second\n')
    const written = modified(vfs, '/dao/log.jsonl')
    vfs.appendFileSync('/dao/log.jsonl', 'third\n')
    const appended = modified(vfs, '/dao/log.jsonl')
    vfs.truncateSync('/dao/log.jsonl', 6)
    const truncated = modified(vfs, '/dao/log.jsonl')
    expect([written > seeded, appended > written, truncated > appended]).toEqual([true, true, true])
    // One millisecond per revision: the increment is the minimum that separates
    // two tokens, not a coarser bump that would skew a real timestamp.
    expect(truncated - seeded).toBe(3)
  })

  it('takes the clock once the clock has passed the entry', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seed('/dao/log.jsonl', 'first\n')
    clock.mockReturnValue(1_700_000_005_000)
    vfs.writeFileSync('/dao/log.jsonl', 'second\n')
    expect(modified(vfs, '/dao/log.jsonl')).toBe(1_700_000_005_000)
  })

  it('extends truncation with zero bytes', async () => {
    const vfs = new MemoryVfs()
    vfs.seed('/dao/file', new Uint8Array([1, 2]))
    vfs.truncateSync('/dao/file', 5)
    expect([...vfs.readFileSync('/dao/file') as Uint8Array]).toEqual([1, 2, 0, 0, 0])
    const handle = vfs.open('/dao/file', 'r+')
    await handle.truncate(7)
    expect([...vfs.readFileSync('/dao/file') as Uint8Array]).toEqual([1, 2, 0, 0, 0, 0, 0])
  })

  it('advances a directory only when its immediate entry set changes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/dao/workspace')
    const empty = modified(vfs, '/dao/workspace')
    vfs.writeFileSync('/dao/workspace/file.txt', 'one')
    const created = modified(vfs, '/dao/workspace')
    vfs.writeFileSync('/dao/workspace/file.txt', 'two')
    const rewritten = modified(vfs, '/dao/workspace')
    vfs.rmSync('/dao/workspace/file.txt')
    const removed = modified(vfs, '/dao/workspace')
    expect([created > empty, rewritten === created, removed > rewritten]).toEqual([true, true, true])
  })
})

describe('mutation publication', () => {
  it('publishes only committed runtime changes and keeps image seeding silent', () => {
    const vfs = new MemoryVfs()
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })
    vfs.seed('/dao/seeded.txt', 'seeded')
    expect(mutations).toEqual([])
    vfs.writeFileSync('/dao/seeded.txt', 'changed')
    vfs.mkdirSync('/dao/created')
    vfs.chmodSync('/dao/created', 0o700)
    vfs.renameSync('/dao/seeded.txt', '/dao/renamed.txt')
    vfs.rmSync('/dao/created', { recursive: true })
    expect(mutations.map(mutation => ({
      kind: mutation.kind,
      path: mutation.path,
      ...mutation.kind === 'write' ? { entryChanged: mutation.entryChanged } : {},
      ...mutation.kind === 'chmod' ? { mode: mutation.mode } : {},
    }))).toEqual([
      { kind: 'write', path: '/dao/seeded.txt', entryChanged: false },
      { kind: 'mkdir', path: '/dao/created' },
      { kind: 'chmod', path: '/dao/created', mode: 0o700 },
      { kind: 'remove', path: '/dao/seeded.txt' },
      { kind: 'write', path: '/dao/renamed.txt', entryChanged: true },
      { kind: 'remove', path: '/dao/created' },
    ])
    const renamed = mutations[4]
    expect(renamed?.kind === 'write' && new TextDecoder().decode(renamed.bytes)).toBe('changed')
    expect(() => { vfs.writeFileSync('/missing/file', 'no') }).toThrow(/ENOENT/)
    expect(mutations).toHaveLength(6)
  })

  it('contains a faulty observer and lets disposal stop later notifications', () => {
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/dao')
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = vfs.subscribe(() => { throw new Error('observer failed') })
    const seen: string[] = []
    const second = vfs.subscribe((mutation) => { seen.push(mutation.path) })
    vfs.writeFileSync('/dao/one', '1')
    first()
    second()
    vfs.writeFileSync('/dao/two', '2')
    expect(seen).toEqual(['/dao/one'])
    expect(reported).toHaveBeenCalledOnce()
  })

  it('feeds the same complete mutations to a durable sink and live subscribers', async () => {
    const recorded: VfsMutation[] = []
    let flushes = 0
    const sink: VfsMutationSink = {
      record: (mutation) => { recorded.push(mutation) },
      flush: async () => { flushes += 1 },
    }
    const vfs = new MemoryVfs({ sink })
    vfs.seedDirectory('/dao')
    const observed: VfsMutation[] = []
    vfs.subscribe((mutation) => { observed.push(mutation) })
    vfs.writeFileSync('/dao/log', 'a')
    vfs.appendFileSync('/dao/log', 'bc')
    await vfs.flush()
    expect(observed).toEqual(recorded)
    expect(observed[0]).toBe(recorded[0])
    expect(recorded[0]).toMatchObject({ kind: 'write', path: '/dao/log', mode: 0o644, entryChanged: true })
    expect(recorded[1]).toMatchObject({ kind: 'write', path: '/dao/log', mode: 0o644, entryChanged: false, appendedFrom: 1 })
    expect(recorded[1]?.kind === 'write' && new TextDecoder().decode(recorded[1].bytes)).toBe('abc')
    expect(flushes).toBe(1)
  })

  it('publishes descriptor writes at the file identity current path', () => {
    const mutations: VfsMutation[] = []
    const vfs = new MemoryVfs()
    vfs.seed('/dao/source', 'old')
    const descriptor = vfs.openFileSync('/dao/source', 'r+')
    vfs.subscribe((mutation) => { mutations.push(mutation) })
    vfs.renameSync('/dao/source', '/dao/destination')
    mutations.length = 0
    descriptor.write(0, new TextEncoder().encode('new'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/dao/destination'])
    expect(vfs.readFileSync('/dao/destination', 'utf8')).toBe('new')
    vfs.unlinkSync('/dao/destination')
    mutations.length = 0
    descriptor.write(0, new TextEncoder().encode('detached'))
    expect(mutations).toEqual([])
    expect(new TextDecoder().decode(descriptor.read(0, descriptor.stat().size))).toBe('detached')
  })

  it('decomposes a directory rename into replayable destination state', () => {
    const recorded: VfsMutation[] = []
    const vfs = new MemoryVfs({
      sink: { record: (mutation) => { recorded.push(mutation) }, flush: () => Promise.resolve() },
    })
    vfs.seedDirectory('/dao/staging/nested', { mode: 0o700 })
    vfs.seed('/dao/staging/nested/file', 'value', { mode: 0o600 })
    vfs.renameSync('/dao/staging', '/dao/published')

    expect(recorded.map(mutation => [mutation.kind, mutation.path])).toEqual([
      ['remove', '/dao/staging'],
      ['mkdir', '/dao/published'],
      ['mkdir', '/dao/published/nested'],
      ['write', '/dao/published/nested/file'],
    ])
    expect(recorded[3]).toMatchObject({ kind: 'write', mode: 0o600, entryChanged: true })
    expect(recorded[3]?.kind === 'write' && new TextDecoder().decode(recorded[3].bytes)).toBe('value')
  })
})

describe('directory rename', () => {
  it('rejects file, non-empty directory, and missing-parent destinations before mutation', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/dao/source/nested/file', 'source')
    vfs.seed('/dao/file', 'destination')
    vfs.seed('/dao/non-empty/child', 'destination')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    expect(() => { vfs.renameSync('/dao/source', '/dao/file') })
      .toThrow(expect.objectContaining({ code: 'ENOTDIR' }))
    expect(() => { vfs.renameSync('/dao/source', '/dao/non-empty') })
      .toThrow(expect.objectContaining({ code: 'ENOTEMPTY' }))
    expect(() => { vfs.renameSync('/dao/source', '/missing/destination') })
      .toThrow(expect.objectContaining({ code: 'ENOENT' }))

    expect(vfs.readFileSync('/dao/source/nested/file', 'utf8')).toBe('source')
    expect(vfs.readFileSync('/dao/file', 'utf8')).toBe('destination')
    expect(vfs.readFileSync('/dao/non-empty/child', 'utf8')).toBe('destination')
    expect(mutations).toEqual([])
  })

  it('replaces an empty directory with the source subtree', () => {
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/dao/source/nested', { mode: 0o700 })
    vfs.seed('/dao/source/nested/file', 'source')
    vfs.seedDirectory('/dao/destination', { mode: 0o711 })

    vfs.renameSync('/dao/source', '/dao/destination')

    expect(vfs.existsSync('/dao/source')).toBe(false)
    expect(vfs.readFileSync('/dao/destination/nested/file', 'utf8')).toBe('source')
    expect((vfs.statSync('/dao/destination') as VfsStats).mode & 0o777).toBe(0o755)
    expect((vfs.statSync('/dao/destination/nested') as VfsStats).mode & 0o777).toBe(0o700)
  })
})

describe('hard links', () => {
  it('shares identity, bytes, and mode until one name is removed', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/dao/session.jsonl', 'committed\n')
    vfs.linkSync('/dao/session.jsonl', '/dao/session-latest.jsonl')
    vfs.linkSync('/dao/session-latest.jsonl', '/dao/session-archive.jsonl')
    expect(identity(vfs, '/dao/session-latest.jsonl')).toBe(identity(vfs, '/dao/session.jsonl'))
    expect(linkCount(vfs, '/dao/session.jsonl')).toBe(3n)
    expect(vfs.readFileSync('/dao/session-latest.jsonl', 'utf8')).toBe('committed\n')
    const changedPaths: string[] = []
    vfs.subscribe((mutation) => { changedPaths.push(mutation.path) })
    vfs.appendFileSync('/dao/session.jsonl', 'appended\n')
    expect(changedPaths).toEqual([
      '/dao/session.jsonl',
      '/dao/session-latest.jsonl',
      '/dao/session-archive.jsonl',
    ])
    expect(vfs.readFileSync('/dao/session.jsonl', 'utf8')).toBe('committed\nappended\n')
    expect(vfs.readFileSync('/dao/session-latest.jsonl', 'utf8')).toBe('committed\nappended\n')
    vfs.chmodSync('/dao/session-latest.jsonl', 0o600)
    expect((vfs.statSync('/dao/session.jsonl') as VfsStats).mode & 0o777).toBe(0o600)
    vfs.unlinkSync('/dao/session-latest.jsonl')
    expect(linkCount(vfs, '/dao/session.jsonl')).toBe(2n)
    vfs.unlinkSync('/dao/session-archive.jsonl')
    expect(linkCount(vfs, '/dao/session.jsonl')).toBe(1n)
    expect(vfs.readFileSync('/dao/session.jsonl', 'utf8')).toBe('committed\nappended\n')
  })

  it('treats rename between names of the same node as a no-op', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/dao/source', 'value')
    vfs.linkSync('/dao/source', '/dao/alias')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    vfs.renameSync('/dao/source', '/dao/alias')

    expect(vfs.readFileSync('/dao/source', 'utf8')).toBe('value')
    expect(vfs.readFileSync('/dao/alias', 'utf8')).toBe('value')
    expect(linkCount(vfs, '/dao/source')).toBe(2n)
    expect(mutations).toEqual([])
  })

  it('retargets linked names through file replacement and directory moves', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/dao/replacement', 'replacement')
    vfs.seed('/dao/target', 'old')
    vfs.linkSync('/dao/target', '/dao/target-alias')
    const replaced = vfs.openFileSync('/dao/target', 'r+')
    vfs.renameSync('/dao/replacement', '/dao/target')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    replaced.write(0, new TextEncoder().encode('changed'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/dao/target-alias'])
    expect(vfs.readFileSync('/dao/target', 'utf8')).toBe('replacement')
    expect(vfs.readFileSync('/dao/target-alias', 'utf8')).toBe('changed')
    expect(linkCount(vfs, '/dao/target-alias')).toBe(1n)

    vfs.seed('/dao/tree/file', 'tree')
    vfs.linkSync('/dao/tree/file', '/dao/outside')
    const moved = vfs.openFileSync('/dao/tree/file', 'r+')
    vfs.renameSync('/dao/tree', '/dao/moved')
    mutations.length = 0
    moved.write(0, new TextEncoder().encode('moved'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/dao/outside', '/dao/moved/file'])
    expect(linkCount(vfs, '/dao/moved/file')).toBe(2n)

    vfs.rmSync('/dao/moved', { recursive: true })
    mutations.length = 0
    moved.write(0, new TextEncoder().encode('kept!'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/dao/outside'])
    expect(vfs.readFileSync('/dao/outside', 'utf8')).toBe('kept!')
    expect(linkCount(vfs, '/dao/outside')).toBe(1n)
  })

  it('rejects renaming a file over an existing directory', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/dao/file', 'value')
    vfs.seedDirectory('/dao/directory')
    expect(() => { vfs.renameSync('/dao/file', '/dao/directory') }).toThrow(expect.objectContaining({ code: 'EISDIR' }))
    expect(vfs.readFileSync('/dao/file', 'utf8')).toBe('value')
    expect(vfs.statSync('/dao/directory').isDirectory()).toBe(true)
  })
})

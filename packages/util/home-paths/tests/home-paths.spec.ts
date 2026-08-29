import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DAO_HOME_DISPLAY,
  DAO_HOME_DIR_NAME,
  canonicalizeWatchPath,
  defaultDshHome,
  daoHomeDisplay,
  daoHomePath,
  expandHomePath,
  resolveDshHome,
} from '@daoai/dao-home-paths'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('dao path helpers', () => {
  it('owns the shared default DAO home directory name', () => {
    expect(DAO_HOME_DIR_NAME).toBe('.dao')
    expect(DEFAULT_DAO_HOME_DISPLAY).toBe('~/.dao')
    expect(defaultDshHome()).toBe(join(homedir(), '.dao'))
  })

  it('expands tilde paths without changing non-tilde paths', () => {
    expect(expandHomePath('~')).toBe(homedir())
    expect(expandHomePath('~/.dao')).toBe(join(homedir(), '.dao'))
    expect(expandHomePath('~\\.dao')).toBe(join(homedir(), '.dao'))
    expect(expandHomePath('/tmp/.dao')).toBe('/tmp/.dao')
    expect(expandHomePath('~other/.dao')).toBe('~other/.dao')
  })

  it('resolves explicit path before DAO_HOME and the default', () => {
    const envHome = join(homedir(), 'env-dao')

    expect(resolveDshHome('/tmp/explicit-dao', { DAO_HOME: '~/env-dao' })).toBe(resolve('/tmp/explicit-dao'))
    expect(resolveDshHome(undefined, { DAO_HOME: '~/env-dao' })).toBe(envHome)
    expect(resolveDshHome(undefined, {})).toBe(defaultDshHome())
  })

  it('treats an empty or whitespace-only DAO_HOME as unset', () => {
    expect(resolveDshHome(undefined, { DAO_HOME: '' })).toBe(defaultDshHome())
    expect(resolveDshHome(undefined, { DAO_HOME: '   ' })).toBe(defaultDshHome())
  })

  it('joins child segments onto the resolved DAO_HOME', () => {
    vi.stubEnv('DAO_HOME', '~/env-dao')
    expect(daoHomePath()).toBe(join(homedir(), 'env-dao'))
    expect(daoHomePath('storages', 'cache')).toBe(join(homedir(), 'env-dao', 'storages', 'cache'))
  })

  it('labels a resolved home by whether it is the default root', () => {
    expect(daoHomeDisplay(resolve(defaultDshHome()))).toBe('~/.dao')
    expect(daoHomeDisplay('/some/other/root')).toBe('$DAO_HOME')
  })

  it('canonicalizes a watcher ancestor while preserving a missing suffix', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dao-watch-path-'))
    const target = join(root, 'target')
    const alias = join(root, 'alias')
    try {
      await mkdir(target)
      await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
      await expect(canonicalizeWatchPath(join(alias, 'later', 'config.yml'))).resolves.toBe(
        join(await realpath(target), 'later', 'config.yml'),
      )
      const file = join(root, 'file')
      await writeFile(file, 'not a directory')
      await expect(canonicalizeWatchPath(join(file, 'child'))).rejects.toMatchObject({ code: 'ENOTDIR' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

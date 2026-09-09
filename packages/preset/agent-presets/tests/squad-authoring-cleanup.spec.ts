/** Failure cleanup after avatar bytes land but managed state does not. */

import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rm: vi.fn((path: Parameters<typeof actual.rm>[0], options?: Parameters<typeof actual.rm>[1]) => (
      String(path).includes('/avatar-')
        ? Promise.reject(new Error('cleanup failed'))
        : actual.rm(path, options)
    )),
  }
})

vi.mock('@daoai/dao-atomic-write', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@daoai/dao-atomic-write')>()
  return {
    ...actual,
    writeFileAtomic: vi.fn((filename: string, ...args: unknown[]) => {
      if (filename.endsWith('persona.override.yml')) return Promise.reject(new Error('state write failed'))
      if (filename.endsWith('cordis.yml')) return Promise.reject(new Error('composition write failed'))
      return (actual.writeFileAtomic as (...values: unknown[]) => Promise<void>)(filename, ...args)
    }),
  }
})

import { createManagedMember, saveManagedAvatar } from '../src/squad-authoring.ts'
import type { AgentPreset, PresetRoot } from '../src/preset.ts'

describe('avatar state-write cleanup', () => {
  it('preserves the state-write failure when obsolete-file cleanup also fails', async () => {
    const systemRoot = await mkdtemp(join(tmpdir(), 'dao-avatar-cleanup-system-'))
    const userRoot = await mkdtemp(join(tmpdir(), 'dao-avatar-cleanup-user-'))
    await mkdir(join(systemRoot, 'reviewer'), { recursive: true })
    const roots: PresetRoot[] = [
      { path: systemRoot, trust: 'system' },
      { path: userRoot, trust: 'user' },
    ]
    const preset: AgentPreset = {
      id: 'reviewer', trust: 'system', path: join(systemRoot, 'reviewer', 'cordis.yml'),
    }
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    await expect(saveManagedAvatar(roots, preset, 'image/png', png.toString('base64'), null))
      .rejects.toThrow('state write failed')
  })

  it('removes a failed create staging directory and preserves the write failure', async () => {
    const systemRoot = await mkdtemp(join(tmpdir(), 'dao-create-cleanup-system-'))
    const userRoot = await mkdtemp(join(tmpdir(), 'dao-create-cleanup-user-'))
    const roots: PresetRoot[] = [
      { path: systemRoot, trust: 'system' },
      { path: userRoot, trust: 'user' },
    ]
    await expect(createManagedMember(roots, 'reviewer', { name: 'Reviewer', persona: 'Review.' }))
      .rejects.toThrow('composition write failed')
  })
})

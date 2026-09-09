/** Squad authoring writes only bounded member fields under the writable root. */

import { chmod, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@daoai/cordis'
import Loader from '@daoai/cordis-plugin-loader'
import Include from '@daoai/cordis-plugin-include'
import { beforeEach, describe, expect, it } from 'vitest'
import AgentPresets, {
  COMPOSITION_FILE, createManagedMember, MAX_AVATAR_BYTES, METADATA_FILE, PERSONA_OVERRIDE_FILE,
  readCompositionPersona, readManagedAvatar, resetManagedPersona,
  saveManagedAvatar,
} from '@daoai/dao-agent-presets'
import type { AgentPreset, PresetRoot } from '@daoai/dao-agent-presets'
import { SQUAD_AUTHORING_LIMITS } from '@daoai/dao-agent-presets/types'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const BASE_PERSONA = 'You are Base. Work carefully.'
const SYSTEM_COMPOSITION = `- id: persona
  name: '@daoai/dao-persona'
  config:
    text: ${BASE_PERSONA}
`

let ctx: Context
let systemRoot: string
let userRoot: string

function roots(): PresetRoot[] {
  return [
    { path: systemRoot, trust: 'system' },
    { path: userRoot, trust: 'user' },
  ]
}

function reviewer(): AgentPreset {
  return {
    id: 'reviewer', trust: 'system', path: join(systemRoot, 'reviewer', COMPOSITION_FILE),
  }
}

beforeEach(async () => {
  systemRoot = await mkdtemp(join(tmpdir(), 'dao-squad-system-'))
  userRoot = await mkdtemp(join(tmpdir(), 'dao-squad-user-'))
  await mkdir(join(systemRoot, 'reviewer'), { recursive: true })
  await writeFile(join(systemRoot, 'reviewer', COMPOSITION_FILE), SYSTEM_COMPOSITION)
  await writeFile(join(systemRoot, 'reviewer', METADATA_FILE), 'name: Reviewer\ndescription: Reviews changes.\n')
  ctx = new Context()
  ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(AgentPresets, {
    default: 'reviewer',
    roots: [
      { path: systemRoot, trust: 'system' as const },
      { path: userRoot, trust: 'user' as const },
    ],
    includeShippedRoot: false,
    includeUserRoot: false,
  })
})

describe('shipped member personalization', () => {
  it('writes only a user-root sidecar and keeps shipped composition bytes unchanged', async () => {
    const before = await readFile(join(systemRoot, 'reviewer', COMPOSITION_FILE), 'utf8')

    const result = await ctx.squad.savePersona(
      'reviewer',
      'You are a strict reviewer. Check every test.',
      ['bash', 'write'],
      null,
    )

    expect(await readFile(join(systemRoot, 'reviewer', COMPOSITION_FILE), 'utf8')).toBe(before)
    expect(await readFile(join(userRoot, 'reviewer', PERSONA_OVERRIDE_FILE), 'utf8'))
      .toContain('You are a strict reviewer. Check every test.')
    expect(await ctx.squad.roster()).toMatchObject({ presets: [expect.objectContaining({
      id: 'reviewer',
      trust: 'system',
      persona: 'You are a strict reviewer. Check every test.',
      personaOverridden: true,
      revision: result.revision,
      tools: ['bash', 'write'],
    })] })
  })

  it('refuses stale writers and preserves the first committed persona', async () => {
    const first = await ctx.squad.savePersona('reviewer', 'First reviewed persona.', [], null)
    await ctx.squad.savePersona('reviewer', 'Second reviewed persona.', [], first.revision)

    await expect(ctx.squad.savePersona('reviewer', 'Stale replacement.', [], first.revision))
      .rejects.toMatchObject({ failure: { code: 'squad-revision-conflict' } })
    expect((await ctx.squad.roster()).presets[0]?.persona).toBe('Second reviewed persona.')
  })

  it('serializes simultaneous writes to the same member', async () => {
    const settled = await Promise.allSettled([
      ctx.squad.savePersona('reviewer', 'First simultaneous persona.', [], null),
      ctx.squad.savePersona('reviewer', 'Second simultaneous persona.', [], null),
    ])
    expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(settled.filter(result => result.status === 'rejected')).toHaveLength(1)
  })

  it('maps reset and avatar lookup failures through the squad service', async () => {
    await expect(ctx.squad.resetPersona('reviewer', 'stale'))
      .rejects.toMatchObject({ failure: { code: 'squad-revision-conflict' } })
    await expect(ctx.squad.readAvatar('missing'))
      .rejects.toMatchObject({ failure: { code: 'agent-preset-not-found' } })
  })

  it('resets persona and restrictions to the shipped values', async () => {
    const saved = await ctx.squad.savePersona('reviewer', 'Temporary persona.', ['bash'], null)

    await ctx.squad.resetPersona('reviewer', saved.revision)

    expect(existsSync(join(userRoot, 'reviewer', PERSONA_OVERRIDE_FILE))).toBe(false)
    expect((await ctx.squad.roster()).presets[0]).toMatchObject({
      persona: BASE_PERSONA,
      personaOverridden: false,
      revision: null,
      tools: [],
    })
  })

  it('retains a managed avatar while resetting the shipped persona', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const avatar = await ctx.squad.saveAvatar('reviewer', 'image/png', png.toString('base64'), null)
    const persona = await ctx.squad.savePersona('reviewer', 'Temporary persona.', ['write'], avatar.revision)

    await ctx.squad.resetPersona('reviewer', persona.revision)

    const row = (await ctx.squad.roster()).presets[0]!
    expect(row).toMatchObject({ persona: BASE_PERSONA, personaOverridden: false, tools: [] })
    expect(row.avatar).toMatch(/^avatar-/)
  })

  it.each([
    ['invalid YAML', '['],
    ['a scalar', 'value'],
    ['a list', '- value'],
    ['the wrong version', 'version: 2\nrevision: r1\ntoolsDeny: []\n'],
    ['an empty revision', "version: 1\nrevision: ''\ntoolsDeny: []\n"],
    ['a non-text persona', 'version: 1\nrevision: r1\npersona: 2\ntoolsDeny: []\n'],
    ['a scalar tool list', 'version: 1\nrevision: r1\ntoolsDeny: write\n'],
    ['a mixed tool list', 'version: 1\nrevision: r1\ntoolsDeny: [write, 2]\n'],
    ['an unsafe avatar', 'version: 1\nrevision: r1\ntoolsDeny: []\navatar: ../avatar.png\n'],
  ])('rejects managed state containing %s', async (_label, content) => {
    const directory = join(userRoot, 'reviewer')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, PERSONA_OVERRIDE_FILE), content)
    await expect(ctx.squad.roster()).rejects.toThrow()
  })

  it('propagates non-absence failures while reading managed state', async () => {
    const sidecar = join(userRoot, 'reviewer', PERSONA_OVERRIDE_FILE)
    await mkdir(sidecar, { recursive: true })
    await expect(ctx.squad.roster()).rejects.toThrow()
  })

  it('finds nested personas and rejects a non-list composition', async () => {
    await writeFile(join(systemRoot, 'reviewer', COMPOSITION_FILE), `- null
- ignored
- group: true
  config:
    - bad
    - id: persona
      name: '@daoai/dao-persona'
      config:
        text: Nested persona.
`)
    await expect(readCompositionPersona(reviewer())).resolves.toBe('Nested persona.')
    await writeFile(join(systemRoot, 'reviewer', COMPOSITION_FILE), 'value: map\n')
    await expect(readCompositionPersona(reviewer())).rejects.toThrow('top-level list')
  })

  it.each([
    "- name: '@daoai/dao-persona'\n  config: null\n",
    "- name: '@daoai/dao-persona'\n  config: []\n",
    "- name: '@daoai/dao-persona'\n  config: text\n",
    "- name: '@daoai/dao-persona'\n  config: { text: 2 }\n",
    '- group: true\n  config: []\n',
  ])('returns no persona for a composition without usable persona text', async (content) => {
    await writeFile(join(systemRoot, 'reviewer', COMPOSITION_FILE), content)
    await expect(readCompositionPersona(reviewer())).resolves.toBeUndefined()
  })
})

describe('user-created members', () => {
  it('creates a minimal non-complete composition and deletes it through the bounded service', async () => {
    const created = await ctx.squad.createMember('qa-reviewer', {
      name: 'QA Reviewer',
      description: 'Checks tests before merge.',
      persona: 'You are QA Reviewer. Check tests before merge.',
      toolsDeny: ['subagent', 'write'],
    })

    const composition = await readFile(join(userRoot, 'qa-reviewer', COMPOSITION_FILE), 'utf8')
    expect(composition).toContain("name: '@daoai/dao-persona'")
    expect(composition).toContain('You are QA Reviewer. Check tests before merge.')
    expect(composition).toContain('complete: false')
    expect(composition).not.toContain('tool-subagent')
    expect((await ctx.squad.roster()).presets.find(row => row.id === 'qa-reviewer')).toMatchObject({
      trust: 'user',
      revision: created.revision,
      tools: ['subagent', 'write'],
    })

    await ctx.squad.savePersona('qa-reviewer', 'A stricter reviewed persona.', ['write'], created.revision)
    expect(await readFile(join(userRoot, 'qa-reviewer', COMPOSITION_FILE), 'utf8')).toBe(composition)
    expect(await readFile(join(userRoot, 'qa-reviewer', PERSONA_OVERRIDE_FILE), 'utf8'))
      .toContain('A stricter reviewed persona.')

    await ctx.squad.deleteMember('qa-reviewer')
    expect(existsSync(join(userRoot, 'qa-reviewer'))).toBe(false)
  })

  it('refuses invalid, reserved, oversized, duplicate, and read-only writes', async () => {
    await expect(ctx.squad.createMember('../escape', {
      name: 'Escape', persona: 'No.',
    })).rejects.toMatchObject({ failure: { code: 'agent-preset-invalid' } })
    await expect(ctx.squad.createMember('blank', {
      name: 'Blank', persona: '   ',
    })).rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
    await expect(ctx.squad.createMember('fork', {
      name: 'Fork', persona: 'Conflicts with the generic fork tool.',
    })).rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
    await expect(ctx.squad.createMember('codex', {
      name: 'Codex', persona: 'Conflicts with the optional Codex tool.',
    })).rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
    await expect(ctx.squad.createMember('multi-line', {
      name: 'Multiple\nlines', persona: 'Valid persona.',
    })).rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
    await expect(ctx.squad.createMember('long-name', {
      name: 'x'.repeat(SQUAD_AUTHORING_LIMITS.nameBytes + 1), persona: 'Valid persona.',
    })).rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
    await expect(ctx.squad.createMember('many-tools', {
      name: 'Many tools',
      persona: 'Valid persona.',
      toolsDeny: Array.from(
        { length: SQUAD_AUTHORING_LIMITS.toolDenyEntries + 1 },
        (_, index) => `tool_${String(index)}`,
      ),
    })).rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
    await expect(ctx.squad.createMember('x'.repeat(SQUAD_AUTHORING_LIMITS.memberIdCharacters + 1), {
      name: 'Long id', persona: 'Valid persona.',
    })).rejects.toMatchObject({ failure: { code: 'agent-preset-invalid' } })
    await expect(ctx.squad.createMember('reviewer', {
      name: 'Duplicate', persona: 'Duplicate.',
    })).rejects.toMatchObject({ failure: { code: 'agent-preset-invalid' } })
    await expect(ctx.squad.deleteMember('reviewer'))
      .rejects.toMatchObject({ failure: { code: 'agent-preset-read-only' } })
    expect(existsSync(join(userRoot, 'escape'))).toBe(false)
  })

  it('validates every bounded display and restriction field', async () => {
    const invalid = async (id: string, input: { name: string; persona: string; description?: string; toolsDeny?: string[] }) => {
      await expect(ctx.squad.createMember(id, input))
        .rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
    }
    await invalid('long-persona', {
      name: 'Long persona', persona: 'x'.repeat(SQUAD_AUTHORING_LIMITS.personaBytes + 1),
    })
    await invalid('blank-name', { name: ' ', persona: 'Valid.' })
    await invalid('blank-description', { name: 'Blank description', description: ' ', persona: 'Valid.' })
    await invalid('multi-description', { name: 'Description', description: 'one\ntwo', persona: 'Valid.' })
    await invalid('long-description', {
      name: 'Description', description: 'x'.repeat(SQUAD_AUTHORING_LIMITS.descriptionBytes + 1), persona: 'Valid.',
    })
    await invalid('long-tool', {
      name: 'Tool', persona: 'Valid.', toolsDeny: ['x'.repeat(SQUAD_AUTHORING_LIMITS.toolNameCharacters + 1)],
    })
    await invalid('invalid-tool', { name: 'Tool', persona: 'Valid.', toolsDeny: ['bad/tool'] })

    await ctx.squad.createMember('minimal-member', { name: 'Minimal', persona: 'Valid.' })
    expect(await readFile(join(userRoot, 'minimal-member', METADATA_FILE), 'utf8'))
      .toBe('name: Minimal\nsquadMember: true\n')
    await expect(createManagedMember(roots(), 'occupied', {
      name: 'Occupied', persona: 'Valid.',
    }, new Set(['subagent_occupied']))).rejects.toThrow('already reserved')
    await expect(resetManagedPersona(roots(), {
      id: 'user-member', trust: 'user', path: join(userRoot, 'user-member', COMPOSITION_FILE),
    }, 'r1')).rejects.toThrow('only a shipped member')
  })

  it('admits only one concurrent create for the same member directory', async () => {
    const input = { name: 'Racer', persona: 'Valid.' }
    const settled = await Promise.allSettled([
      createManagedMember(roots(), 'racer', input),
      createManagedMember(roots(), 'racer', input),
    ])
    expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(settled.filter(result => result.status === 'rejected')).toHaveLength(1)
    await expect(createManagedMember(roots(), 'racer', input)).rejects.toThrow('already exists')
  })
})

describe('UI-only avatars', () => {
  it('stores validated bytes in the user shadow and returns them without a Host path', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

    const saved = await ctx.squad.saveAvatar('reviewer', 'image/png', png.toString('base64'), null)

    const row = (await ctx.squad.roster()).presets[0]
    expect(row?.avatar).toMatch(/^avatar-[0-9a-f-]+\.png$/)
    expect(await readFile(join(userRoot, 'reviewer', row?.avatar ?? 'missing'))).toEqual(png)
    expect(await readFile(join(userRoot, 'reviewer', PERSONA_OVERRIDE_FILE), 'utf8')).toContain('avatar:')
    expect(await ctx.squad.readAvatar('reviewer')).toEqual({
      mediaType: 'image/png',
      base64: png.toString('base64'),
    })
    expect((await ctx.squad.roster()).presets[0]).toMatchObject({
      avatar: row?.avatar,
      revision: saved.revision,
    })
    expect((await ctx.squad.roster()).presets[0]).not.toHaveProperty('avatarPath')
  })

  it('rejects traversal metadata and mismatched image bytes', async () => {
    await expect(ctx.squad.saveAvatar(
      'reviewer', 'image/png', Buffer.from('not-png').toString('base64'), null,
    )).rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
    await expect(ctx.squad.saveAvatar('reviewer', 'image/png', 'not-base64', null))
      .rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
    await expect(ctx.squad.saveAvatar(
      'reviewer',
      'image/png',
      'A'.repeat(Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 4),
      null,
    )).rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
  })

  it.each([
    ['image/jpeg' as const, Buffer.from([0xff, 0xd8, 1, 0xff, 0xd9]), '.jpg'],
    ['image/gif' as const, Buffer.from('GIF87a-body'), '.gif'],
    ['image/gif' as const, Buffer.from('GIF89a-body'), '.gif'],
    ['image/webp' as const, Buffer.from('RIFFxxxxWEBPbody'), '.webp'],
  ])('accepts %s bytes and replaces the previous managed image', async (mediaType, bytes, extension) => {
    const first = await ctx.squad.saveAvatar('reviewer', mediaType, bytes.toString('base64'), null)
    const firstAvatar = (await ctx.squad.roster()).presets[0]!.avatar!
    expect(firstAvatar.endsWith(extension)).toBe(true)
    const second = await ctx.squad.saveAvatar('reviewer', mediaType, bytes.toString('base64'), first.revision)
    expect(second.revision).not.toBe(first.revision)
    expect(existsSync(join(userRoot, 'reviewer', firstAvatar))).toBe(false)
  })

  it('rejects every malformed image signature and canonical-base64 edge', async () => {
    const reject = async (mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp', bytes: Buffer) => {
      await expect(ctx.squad.saveAvatar('reviewer', mediaType, bytes.toString('base64'), null))
        .rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
    }
    await reject('image/jpeg', Buffer.from([0, 0xd8, 1, 0xff, 0xd9]))
    await reject('image/jpeg', Buffer.from([0xff, 0, 1, 0xff, 0xd9]))
    await reject('image/jpeg', Buffer.from([0xff, 0xd8, 1, 0, 0xd9]))
    await reject('image/jpeg', Buffer.from([0xff, 0xd8, 1, 0xff, 0]))
    await reject('image/gif', Buffer.from('GIF00a-body'))
    await reject('image/webp', Buffer.from('NOPE----WEBPbody'))
    await reject('image/webp', Buffer.from('RIFFxxxxNOPEbody'))
    await expect(ctx.squad.saveAvatar('reviewer', 'image/png', '****', null))
      .rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
    await expect(ctx.squad.saveAvatar('reviewer', 'image/png', '', null))
      .rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
    await expect(ctx.squad.saveAvatar('reviewer', 'image/tiff' as never, 'AAAA', null))
      .rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
    await expect(ctx.squad.saveAvatar(
      'reviewer', 'image/png', Buffer.alloc(MAX_AVATAR_BYTES + 1).toString('base64'), null,
    )).rejects.toMatchObject({ failure: { code: 'squad-member-invalid' } })
  })

  it('returns no avatar for incomplete, unknown, or unreadable avatar references', async () => {
    await expect(readManagedAvatar(reviewer())).resolves.toBeUndefined()
    await expect(readManagedAvatar({ ...reviewer(), avatar: 'avatar.png' })).resolves.toBeUndefined()
    await expect(readManagedAvatar({
      ...reviewer(), avatar: 'avatar.bmp', avatarPath: join(userRoot, 'missing.bmp'),
    })).resolves.toBeUndefined()
    await expect(readManagedAvatar({
      ...reviewer(), avatar: 'avatar.png', avatarPath: join(userRoot, 'missing.png'),
    })).resolves.toBeUndefined()
  })

  it('cleans an avatar temporary file when the binary write fails', async () => {
    const directory = join(userRoot, 'reviewer')
    await mkdir(directory, { recursive: true })
    await chmod(directory, 0o500)
    try {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      await expect(saveManagedAvatar(
        roots(), reviewer(), 'image/png', png.toString('base64'), null,
      )).rejects.toThrow()
    } finally {
      await chmod(directory, 0o700)
    }
  })
})

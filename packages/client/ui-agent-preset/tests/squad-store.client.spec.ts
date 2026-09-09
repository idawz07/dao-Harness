/** Reviewed squad-manager browser workflow. */

import type { ClientRemote } from '@daoai/dao-api-remotes/client'
import type { AgentPresetRow } from '@daoai/dao-agent-presets/types'
import { describe, expect, it, vi } from 'vitest'
import {
  createBlocker, parseToolRestrictions, SquadManagerController,
  type SquadCreateDraft,
} from '../src/client/squad-store.ts'

const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value })

function member(id: string, patch: Partial<AgentPresetRow> = {}): AgentPresetRow {
  return {
    id, trust: 'system', isDefault: false, name: id, description: `${id} work`, order: 20,
    squadMember: true, persona: `You are ${id}.`, personaOverridden: false,
    revision: 'r1', tools: [], ...patch,
  }
}

function harness(initial: AgentPresetRow[] = [member('scout')]) {
  let rows = initial
  const calls: Array<{ method: string; value: unknown }> = []
  let changed = 0
  const remote = {
    agentPresets: {
      list: () => ok({ presets: rows, authorable: true, maxAvatarBytes: 2 * 1024 * 1024 }),
      readAvatar: (id: string) => ok(id === 'pictured'
        ? { mediaType: 'image/png' as const, base64: 'AA==' }
        : undefined),
      savePersona: (id: string, persona: string, tools: readonly string[], revision: string | null) => {
        calls.push({ method: 'savePersona', value: { id, persona, tools, revision } })
        rows = rows.map(row => row.id === id
          ? { ...row, persona, tools, revision: 'r2', personaOverridden: true }
          : row)
        return ok({ revision: 'r2' })
      },
      resetPersona: (id: string, revision: string) => {
        calls.push({ method: 'resetPersona', value: { id, revision } })
        rows = rows.map(row => row.id === id ? { ...row, personaOverridden: false, revision: null } : row)
        return ok(undefined)
      },
      createMember: (id: string, input: unknown) => {
        calls.push({ method: 'createMember', value: { id, input } })
        rows = [...rows, member(id, { trust: 'user', ...(input as object) })]
        return ok({ revision: 'new' })
      },
      deleteMember: (id: string) => {
        calls.push({ method: 'deleteMember', value: id })
        rows = rows.filter(row => row.id !== id)
        return ok(undefined)
      },
      saveAvatar: (id: string, mediaType: string, base64: string, revision: string | null) => {
        calls.push({ method: 'saveAvatar', value: { id, mediaType, base64, revision } })
        return ok({ revision: 'r2' })
      },
    },
    squadDraft: {
      draft: (description: string, base: undefined) => {
        calls.push({ method: 'draft', value: { description, base } })
        return ok({
          name: 'QA reviewer', description: 'Checks tests.', persona: 'Review tests before merge.',
          toolsDenySuggestion: ['write'],
        })
      },
    },
  } as unknown as Pick<ClientRemote, 'agentPresets' | 'squadDraft'>
  const controller = new SquadManagerController(remote, () => { changed += 1 })
  return { controller, calls, changed: () => changed, remote }
}

describe('squad manager state', () => {
  it('loads only members in declared order and reads only declared avatars', async () => {
    const ordinary = member('ordinary', { squadMember: false })
    const { controller } = harness([
      member('later', { order: 30 }), member('pictured', { avatar: 'avatar.png', order: 10 }), ordinary,
    ])

    await controller.load()

    const state = controller.store.getSnapshot()
    expect(state.rows.map(row => row.id)).toEqual(['pictured', 'later'])
    expect(state.avatars.pictured).toEqual({ mediaType: 'image/png', base64: 'AA==' })
  })

  it('handles list failures, exceptions, unavailable deployments, and repeated loads', async () => {
    const listed = harness()
    vi.spyOn(listed.remote.agentPresets, 'list').mockResolvedValueOnce({
      ok: false, error: { code: 'internal', message: 'list failed' },
    } as never)
    await listed.controller.load()
    expect(listed.controller.store.getSnapshot()).toMatchObject({ status: 'error', error: 'list failed' })
    vi.spyOn(listed.remote.agentPresets, 'list').mockRejectedValueOnce('offline')
    await listed.controller.load()
    expect(listed.controller.store.getSnapshot().error).toBe('offline')

    const unavailable = harness([])
    vi.spyOn(unavailable.remote.agentPresets, 'list').mockResolvedValueOnce(ok({
      presets: [], authorable: false, maxAvatarBytes: 12,
    }) as never)
    await unavailable.controller.load()
    expect(unavailable.controller.store.getSnapshot().status).toBe('unavailable')

    unavailable.controller.store.set({ ...unavailable.controller.store.getSnapshot(), status: 'loading' })
    await unavailable.controller.load()
    expect(unavailable.controller.store.getSnapshot().status).toBe('loading')
  })

  it('sorts equal and unspecified positions by id and omits unreadable avatars', async () => {
    const { order: _zetaOrder, ...zeta } = member('zeta', { avatar: 'zeta.png' })
    const { order: _omegaOrder, ...omega } = member('omega')
    const { controller, remote } = harness([
      zeta, member('beta', { order: 10 }), member('alpha', { order: 10 }), omega,
    ])
    vi.spyOn(remote.agentPresets, 'readAvatar').mockResolvedValue({
      ok: false, error: { code: 'internal', message: 'unreadable' },
    } as never)
    await controller.load()
    expect(controller.store.getSnapshot().rows.map(row => row.id)).toEqual(['alpha', 'beta', 'omega', 'zeta'])
    expect(controller.store.getSnapshot().avatars).toEqual({})
  })

  it('commits verbatim persona text with stable restrict-only names', async () => {
    const { controller, calls, changed } = harness()
    await controller.load()
    controller.beginEdit('scout')
    controller.setEditPersona('  Keep deliberate whitespace.  ')
    controller.setEditTools('write, bash, write')

    await controller.saveEdit()

    expect(calls.at(-1)).toEqual({
      method: 'savePersona',
      value: { id: 'scout', persona: '  Keep deliberate whitespace.  ', tools: ['bash', 'write'], revision: 'r1' },
    })
    expect(controller.store.getSnapshot().edit).toBeNull()
    expect(changed()).toBe(1)
  })

  it('guards edit operations and records remote save and reset failures', async () => {
    const { name: _anonymousName, ...anonymous } = member('anonymous', { trust: 'user' })
    const { persona: _brokenPersona, ...broken } = member('broken')
    const { controller, remote } = harness([
      anonymous, broken,
    ])
    controller.setEditPersona('ignored')
    controller.setEditTools('ignored')
    await controller.saveEdit()
    await controller.resetEdit()
    await controller.load()
    controller.beginEdit('missing')
    controller.beginEdit('broken')
    controller.beginEdit('anonymous')
    expect(controller.store.getSnapshot().edit).toMatchObject({ name: 'anonymous', resettable: false })
    await controller.resetEdit()
    controller.setEditPersona(' ')
    await controller.saveEdit()
    controller.setEditPersona('Ready')
    vi.spyOn(remote.agentPresets, 'savePersona').mockResolvedValueOnce({
      ok: false, error: { code: 'internal', message: 'save refused' },
    } as never)
    await controller.saveEdit()
    expect(controller.store.getSnapshot().edit?.error).toBe('save refused')
    vi.spyOn(remote.agentPresets, 'savePersona').mockRejectedValueOnce(new Error('save crashed'))
    await controller.saveEdit()
    expect(controller.store.getSnapshot().edit?.error).toBe('save crashed')
    controller.cancelEdit()
    expect(controller.store.getSnapshot().edit).toBeNull()

    await controller.load()
    controller.store.set({ ...controller.store.getSnapshot(), rows: [member('scout', { personaOverridden: true })] })
    controller.beginEdit('scout')
    vi.spyOn(remote.agentPresets, 'resetPersona').mockResolvedValueOnce({
      ok: false, error: { code: 'internal', message: 'reset refused' },
    } as never)
    await controller.resetEdit()
    expect(controller.store.getSnapshot().edit?.error).toBe('reset refused')
    vi.spyOn(remote.agentPresets, 'resetPersona').mockRejectedValueOnce(new Error('reset crashed'))
    await controller.resetEdit()
    expect(controller.store.getSnapshot().edit?.error).toBe('reset crashed')
  })

  it('drafts into review without creating until the reviewed commit', async () => {
    const { controller, calls } = harness()
    await controller.load()
    controller.beginCreate()
    controller.setCreate('descriptionPrompt', 'a QA reviewer that checks tests before merge')

    await controller.draftCreate()

    expect(controller.store.getSnapshot().create).toMatchObject({
      step: 'review', name: 'QA reviewer', persona: 'Review tests before merge.', tools: 'write',
    })
    expect(calls.map(call => call.method)).toEqual(['draft'])
    controller.setCreate('id', 'qa-reviewer')
    await controller.saveCreate()
    expect(calls.map(call => call.method)).toEqual(['draft', 'createMember'])
  })

  it('guards draft and create operations and reports their failures', async () => {
    const { controller, remote } = harness()
    controller.setCreate('name', 'ignored')
    await controller.draftCreate()
    await controller.saveCreate()
    controller.beginCreate()
    await controller.draftCreate()
    controller.setCreate('descriptionPrompt', 'reviewer')
    vi.spyOn(remote.squadDraft, 'draft').mockResolvedValueOnce({
      ok: false, error: { code: 'internal', message: 'draft refused' },
    } as never)
    await controller.draftCreate()
    expect(controller.store.getSnapshot().create?.error).toBe('draft refused')
    vi.spyOn(remote.squadDraft, 'draft').mockRejectedValueOnce(new Error('draft crashed'))
    await controller.draftCreate()
    expect(controller.store.getSnapshot().create?.error).toBe('draft crashed')
    controller.cancelCreate()

    controller.beginCreate()
    controller.setCreate('descriptionPrompt', 'reviewer')
    await controller.draftCreate()
    controller.setCreate('id', 'new-member')
    vi.spyOn(remote.agentPresets, 'createMember').mockResolvedValueOnce({
      ok: false, error: { code: 'internal', message: 'create refused' },
    } as never)
    await controller.saveCreate()
    expect(controller.store.getSnapshot().create?.error).toBe('create refused')
    vi.spyOn(remote.agentPresets, 'createMember').mockRejectedValueOnce(new Error('create crashed'))
    await controller.saveCreate()
    expect(controller.store.getSnapshot().create?.error).toBe('create crashed')
  })

  it('omits an empty description and honors saving-state guards', async () => {
    const { controller, calls } = harness()
    await controller.load()
    controller.beginCreate()
    controller.setCreate('descriptionPrompt', 'reviewer')
    await controller.draftCreate()
    controller.setCreate('id', 'new-member')
    controller.store.set({
      ...controller.store.getSnapshot(),
      create: { ...controller.store.getSnapshot().create!, saving: true },
    })
    await controller.saveCreate()
    expect(calls.map(call => call.method)).toEqual(['draft'])
    controller.store.set({
      ...controller.store.getSnapshot(),
      create: { ...controller.store.getSnapshot().create!, saving: false, description: ' ' },
    })
    await controller.saveCreate()
    expect(calls.at(-1)).toMatchObject({ method: 'createMember', value: { input: { name: 'QA reviewer' } } })
  })

  it('resets only a personalized shipped member and deletes a user member explicitly', async () => {
    const { controller, calls } = harness([
      member('scout', { personaOverridden: true }), member('mine', { trust: 'user' }),
    ])
    await controller.load()
    controller.beginEdit('scout')
    await controller.resetEdit()
    controller.confirmDelete('mine')
    await controller.remove()

    expect(calls.map(call => call.method)).toEqual(['resetPersona', 'deleteMember'])
  })

  it('passes avatar bytes with the row revision and surfaces local admission failures', async () => {
    const { controller, calls, remote } = harness()
    await controller.load()
    await controller.saveAvatar('scout', 'image/png', 'AA==')
    controller.reportError('bad avatar')

    expect(calls[0]).toEqual({
      method: 'saveAvatar', value: { id: 'scout', mediaType: 'image/png', base64: 'AA==', revision: 'r1' },
    })
    expect(controller.store.getSnapshot().error).toBe('bad avatar')

    const withoutObserver = new SquadManagerController(remote)
    await withoutObserver.load()
    await withoutObserver.saveAvatar('scout', 'image/png', 'AA==')
  })

  it('guards absent avatar and delete targets and reports remote failures', async () => {
    const { controller, remote } = harness([member('mine', { trust: 'user' })])
    await controller.saveAvatar('missing', 'image/png', 'AA==')
    await controller.remove()
    await controller.load()
    vi.spyOn(remote.agentPresets, 'saveAvatar').mockResolvedValueOnce({
      ok: false, error: { code: 'internal', message: 'avatar refused' },
    } as never)
    await controller.saveAvatar('mine', 'image/png', 'AA==')
    expect(controller.store.getSnapshot().error).toBe('avatar refused')
    vi.spyOn(remote.agentPresets, 'saveAvatar').mockRejectedValueOnce(new Error('avatar crashed'))
    await controller.saveAvatar('mine', 'image/png', 'AA==')
    expect(controller.store.getSnapshot().error).toBe('avatar crashed')

    controller.confirmDelete('mine')
    vi.spyOn(remote.agentPresets, 'deleteMember').mockResolvedValueOnce({
      ok: false, error: { code: 'internal', message: 'delete refused' },
    } as never)
    await controller.remove()
    expect(controller.store.getSnapshot()).toMatchObject({ pendingDelete: null, error: 'delete refused' })
    controller.confirmDelete('mine')
    vi.spyOn(remote.agentPresets, 'deleteMember').mockRejectedValueOnce(new Error('delete crashed'))
    await controller.remove()
    expect(controller.store.getSnapshot()).toMatchObject({ pendingDelete: null, error: 'delete crashed' })
  })
})

describe('review validation', () => {
  const draft = (patch: Partial<SquadCreateDraft> = {}): SquadCreateDraft => ({
    step: 'review', descriptionPrompt: 'x', id: 'reviewer', name: 'Reviewer', description: '',
    persona: 'Review.', tools: '', drafting: false, saving: false, error: null, ...patch,
  })

  it('rejects missing, unsafe, occupied, and incomplete reviewed fields', () => {
    expect(createBlocker(draft({ id: '' }), [])).toBe('memberIdRequired')
    expect(createBlocker(draft({ id: '../bad' }), [])).toBe('memberIdInvalid')
    expect(createBlocker(draft(), [member('reviewer')])).toBe('memberIdTaken')
    expect(createBlocker(draft({ name: ' ' }), [])).toBe('memberNameRequired')
    expect(createBlocker(draft({ persona: ' ' }), [])).toBe('personaRequired')
    expect(createBlocker(draft(), [])).toBeUndefined()
    expect(parseToolRestrictions(' write, bash, write, ')).toEqual(['bash', 'write'])
  })
})

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector, makeTranslate } from '@daoai/dao-client-test-runtime'
import { createSnapshotStore } from '@daoai/dao-client-store'
import type { AgentPresetRow } from '@daoai/dao-agent-presets/types'
import { avatarPayload, SquadManager, type SquadManagerProps } from '../src/client/SquadManager.tsx'
import type { SquadManagerState } from '../src/client/squad-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const t = makeTranslate(en)

const SYSTEM: AgentPresetRow = {
  id: 'scout', trust: 'system', isDefault: false, name: 'Scout', description: 'Researches.',
  squadMember: true, persona: 'Research carefully.', personaOverridden: true, revision: 'r1',
  tools: ['write'], avatar: 'avatar-r1.png',
}

const USER: AgentPresetRow = {
  id: 'reviewer', trust: 'user', isDefault: false, squadMember: true, persona: 'Review.',
  personaOverridden: false, revision: 'r2', tools: [],
}

const READY: SquadManagerState = {
  status: 'ready', authorable: true, maxAvatarBytes: 1024, rows: [SYSTEM, USER],
  avatars: { scout: { mediaType: 'image/png', base64: 'iVBORw==' } }, edit: null, create: null,
  pendingDelete: null, error: null,
}

function actions() {
  return {
    load: vi.fn(() => Promise.resolve()), beginEdit: vi.fn(), setEditPersona: vi.fn(), setEditTools: vi.fn(),
    cancelEdit: vi.fn(), saveEdit: vi.fn(() => Promise.resolve()), resetEdit: vi.fn(() => Promise.resolve()),
    beginCreate: vi.fn(), setCreate: vi.fn(), cancelCreate: vi.fn(), draftCreate: vi.fn(() => Promise.resolve()),
    saveCreate: vi.fn(() => Promise.resolve()), saveAvatar: vi.fn(() => Promise.resolve()), reportError: vi.fn(),
    confirmDelete: vi.fn(), remove: vi.fn(() => Promise.resolve()),
  }
}

function manager(state: SquadManagerState = READY) {
  const store = createSnapshotStore(state)
  const calls = actions()
  const props = {
    ...calls,
    useSquadManager: bindSnapshotSelector(store),
    t,
  } as unknown as SquadManagerProps
  const view = render(<SquadManager {...props} />)
  return { ...calls, store, props, view }
}

describe('squad manager avatar admission', () => {
  it('encodes a supported image after checking its browser file size', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'avatar.png', { type: 'image/png' })
    await expect(avatarPayload(file, 3)).resolves.toEqual({ mediaType: 'image/png', base64: 'AQID' })
  })

  it('rejects empty, oversized, and unsupported files before upload', async () => {
    await expect(avatarPayload(new File([], 'empty.png', { type: 'image/png' }), 1))
      .rejects.toThrow('avatar-size-invalid')
    await expect(avatarPayload(new File(
      [new Uint8Array(2)],
      'large.png',
      { type: 'image/png' },
    ), 1)).rejects.toThrow('avatar-size-invalid')
    await expect(avatarPayload(new File([new Uint8Array([1])], 'avatar.svg', { type: 'image/svg+xml' }), 1))
      .rejects.toThrow('unsupported-avatar-media-type')
  })

  it('rejects a failed browser read and a non-data result', async () => {
    class FailedReader {
      result: string | ArrayBuffer | null = null
      error: Error | null = new Error('reader failed')
      listeners: Record<string, () => void> = {}
      addEventListener(name: string, listener: () => void) { this.listeners[name] = listener }
      readAsDataURL() { this.listeners.error?.() }
    }
    vi.stubGlobal('FileReader', FailedReader)
    await expect(avatarPayload(new File(['x'], 'avatar.png', { type: 'image/png' }), 2))
      .rejects.toThrow('reader failed')

    class EmptyFailureReader extends FailedReader {
      override error = null
    }
    vi.stubGlobal('FileReader', EmptyFailureReader)
    await expect(avatarPayload(new File(['x'], 'avatar.png', { type: 'image/png' }), 2))
      .rejects.toThrow('avatar-read-failed')

    class BinaryReader extends FailedReader {
      override result: ArrayBuffer | null = new ArrayBuffer(1)
      override readAsDataURL() { this.listeners.load?.() }
    }
    vi.stubGlobal('FileReader', BinaryReader)
    await expect(avatarPayload(new File(['x'], 'avatar.png', { type: 'image/png' }), 2))
      .rejects.toThrow('avatar-read-failed')
  })

  it('rejects a string result that is not a data URL', async () => {
    class TextReader {
      result: string | null = 'missing-comma'
      error: Error | null = null
      listeners: Record<string, () => void> = {}
      addEventListener(name: string, listener: () => void) { this.listeners[name] = listener }
      readAsDataURL() { this.listeners.load?.() }
    }
    vi.stubGlobal('FileReader', TextReader)
    await expect(avatarPayload(new File(['x'], 'avatar.png', { type: 'image/png' }), 2))
      .rejects.toThrow('avatar-read-failed')
  })
})

describe('SquadManager', () => {
  it('hides unavailable state and offers retry for load failures', async () => {
    const hidden = manager({ ...READY, status: 'unavailable' })
    expect(hidden.view.container.firstChild).toBeNull()
    hidden.view.unmount()

    const failed = manager({ ...READY, status: 'error', error: null })
    expect(screen.getByRole('alert').textContent).toBe(en.squadLoadError)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(failed.load).toHaveBeenCalledTimes(2) })
  })

  it('renders roster states and routes its primary actions', async () => {
    const h = manager({ ...READY, status: 'loading', error: 'stale warning' })
    await waitFor(() => { expect(h.load).toHaveBeenCalledOnce() })
    expect(screen.getByText(en.loading)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('stale warning')
    expect(screen.getByText('Researches.')).toBeTruthy()
    expect(screen.getByText(en.noDescription)).toBeTruthy()
    expect(screen.getByText(en.squadBuiltIn)).toBeTruthy()
    expect(screen.getByText(en.squadCustom)).toBeTruthy()
    expect(screen.getByText(en.squadPersonalized)).toBeTruthy()
    expect(document.querySelector('img')?.src).toContain('data:image/png;base64,iVBORw==')

    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    expect(h.beginEdit).toHaveBeenCalledWith('scout')
    fireEvent.click(screen.getByRole('button', { name: en.delete }))
    expect(h.confirmDelete).toHaveBeenCalledWith('reviewer')
    fireEvent.click(screen.getByRole('button', { name: en.squadCreate }))
    expect(h.beginCreate).toHaveBeenCalledOnce()
  })

  it('renders and edits a resettable persona dialog', () => {
    const h = manager({
      ...READY,
      edit: {
        id: 'scout', name: 'Scout', persona: 'Research.', tools: 'write', revision: 'r1',
        resettable: true, saving: false, error: 'conflict',
      },
    })
    expect(screen.getByText('conflict')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(en.squadPersona), { target: { value: 'Updated.' } })
    fireEvent.change(screen.getByLabelText(en.squadToolRestrictions), { target: { value: 'bash' } })
    expect(h.setEditPersona).toHaveBeenCalledWith('Updated.')
    expect(h.setEditTools).toHaveBeenCalledWith('bash')
    fireEvent.click(screen.getByRole('button', { name: en.squadReset }))
    fireEvent.click(screen.getByRole('button', { name: en.squadSave }))
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    expect(h.resetEdit).toHaveBeenCalledOnce()
    expect(h.saveEdit).toHaveBeenCalledOnce()
    expect(h.cancelEdit).toHaveBeenCalledOnce()
  })

  it('disables persona actions while saving or empty', () => {
    const h = manager({
      ...READY,
      edit: {
        id: 'scout', name: 'Scout', persona: ' ', tools: '', revision: null,
        resettable: false, saving: true, error: null,
      },
    })
    expect(screen.getByRole('button', { name: en.squadSaving })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: en.cancel })).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: en.squadReset })).toBeNull()
    expect(h.load).toHaveBeenCalledOnce()
  })

  it('routes description drafting and reports its error state', () => {
    const h = manager({
      ...READY,
      create: {
        step: 'describe', descriptionPrompt: 'Build a reviewer', id: '', name: '', description: '',
        persona: '', tools: '', drafting: false, saving: false, error: 'draft failed',
      },
    })
    fireEvent.change(screen.getByLabelText(en.squadDescribe), { target: { value: 'Build an auditor' } })
    expect(h.setCreate).toHaveBeenCalledWith('descriptionPrompt', 'Build an auditor')
    fireEvent.click(screen.getByRole('button', { name: en.squadDraftAction }))
    expect(h.draftCreate).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert').textContent).toBe('draft failed')
  })

  it('renders the drafting and reviewed-create states', () => {
    const drafting = manager({
      ...READY,
      create: {
        step: 'describe', descriptionPrompt: 'x', id: '', name: '', description: '', persona: '', tools: '',
        drafting: true, saving: false, error: null,
      },
    })
    expect(screen.getByRole('button', { name: en.squadDrafting })).toHaveProperty('disabled', true)
    drafting.view.unmount()

    const h = manager({
      ...READY,
      create: {
        step: 'review', descriptionPrompt: 'x', id: '', name: 'Reviewer', description: 'Reviews.',
        persona: 'Review.', tools: 'write', drafting: false, saving: false, error: null,
      },
    })
    expect(screen.getByRole('alert').textContent).toBe(en.memberIdRequired)
    for (const [label, field, value] of [
      [en.presetId, 'id', 'reviewer-2'],
      [en.displayName, 'name', 'Reviewer 2'],
      [en.squadRoleDescription, 'description', 'Reviews changes.'],
      [en.squadPersona, 'persona', 'Review carefully.'],
      [en.squadToolRestrictions, 'tools', 'read'],
    ] as const) {
      fireEvent.change(screen.getAllByLabelText(label).at(-1)!, { target: { value } })
      expect(h.setCreate).toHaveBeenCalledWith(field, value)
    }
  })

  it('commits a valid reviewed member and shows remote errors or saving state', () => {
    const valid = {
      step: 'review' as const, descriptionPrompt: 'x', id: 'reviewer-2', name: 'Reviewer 2',
      description: '', persona: 'Review.', tools: '', drafting: false, saving: false, error: null,
    }
    const h = manager({ ...READY, create: valid })
    fireEvent.click(screen.getAllByRole('button', { name: en.squadCreateMember }).at(-1)!)
    expect(h.saveCreate).toHaveBeenCalledOnce()
    h.view.rerender(<SquadManager {...{
      ...h.props,
      useSquadManager: bindSnapshotSelector(createSnapshotStore({
        ...READY, create: { ...valid, saving: true, error: 'save failed' },
      })),
    }} />)
    expect(screen.getByRole('button', { name: en.squadSaving })).toHaveProperty('disabled', true)
    expect(screen.getByRole('alert').textContent).toBe('save failed')
  })

  it('uploads valid avatars, reports invalid ones, and confirms deletion', async () => {
    const h = manager({ ...READY, pendingDelete: 'reviewer' })
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]')
    fireEvent.change(inputs[0]!, {
      target: { files: [new File([new Uint8Array([1])], 'avatar.png', { type: 'image/png' })] },
    })
    await waitFor(() => { expect(h.saveAvatar).toHaveBeenCalledWith('scout', 'image/png', 'AQ==') })
    fireEvent.change(inputs[1]!, {
      target: { files: [new File([], 'empty.png', { type: 'image/png' })] },
    })
    await waitFor(() => { expect(h.reportError).toHaveBeenCalledWith(en.squadAvatarError) })
    fireEvent.change(inputs[1]!, { target: { files: [] } })

    expect(screen.getByText(`${en.squadDeleteDescription} reviewer`)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: en.close }).at(-1)!)
    expect(h.confirmDelete).toHaveBeenCalledWith(null)
    fireEvent.click(screen.getAllByRole('button', { name: en.deleteConfirm }).at(-1)!)
    expect(h.remove).toHaveBeenCalledOnce()
    const cancels = screen.getAllByRole('button', { name: en.cancel })
    fireEvent.click(cancels.at(-1)!)
    expect(h.confirmDelete).toHaveBeenCalledWith(null)
    act(() => { h.store.set({ ...READY, pendingDelete: 'missing' }) })
    expect(screen.queryByText(en.squadDeleteDescription, { exact: false })).toBeNull()
  })
})

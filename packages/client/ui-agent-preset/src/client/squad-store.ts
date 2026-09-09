/** Browser state and reviewed write flow for managed squad members. */

import type { ClientRemote } from '@daoai/dao-api-remotes/client'
import type { AgentPresetRow, SquadAvatar } from '@daoai/dao-agent-presets/types'
import { createSnapshotStore, type SnapshotStore } from '@daoai/dao-client-store'
import { messageOf } from './settings-store.ts'

const MEMBER_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

/** One open persona editor. */
export interface SquadEditDraft {
  readonly id: string
  readonly name: string
  readonly persona: string
  readonly tools: string
  readonly revision: string | null
  readonly resettable: boolean
  readonly saving: boolean
  readonly error: string | null
}

/** Explicit two-step create flow: description, then reviewed fields. */
export interface SquadCreateDraft {
  readonly step: 'describe' | 'review'
  readonly descriptionPrompt: string
  readonly id: string
  readonly name: string
  readonly description: string
  readonly persona: string
  readonly tools: string
  readonly drafting: boolean
  readonly saving: boolean
  readonly error: string | null
}

/** Squad management snapshot. */
export interface SquadManagerState {
  readonly status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
  readonly authorable: boolean
  readonly maxAvatarBytes: number
  readonly rows: readonly AgentPresetRow[]
  readonly avatars: Readonly<Record<string, SquadAvatar>>
  readonly edit: SquadEditDraft | null
  readonly create: SquadCreateDraft | null
  readonly pendingDelete: string | null
  readonly error: string | null
}

const INITIAL: SquadManagerState = {
  status: 'idle', authorable: false, maxAvatarBytes: 0, rows: [], avatars: {}, edit: null, create: null,
  pendingDelete: null, error: null,
}

/**
 * Split a comma-separated restriction field into a stable unique list.
 * @param value - Editable comma-separated tool names.
 * @returns Sorted unique non-empty names.
 */
export function parseToolRestrictions(value: string): string[] {
  return [...new Set(value.split(',').map(part => part.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
}

/**
 * Validate the reviewed create fields before crossing the wire.
 * @param draft - Current reviewed fields.
 * @param rows - Existing members used to detect duplicate ids.
 * @returns The first blocking locale key, or undefined when committable.
 */
export function createBlocker(draft: SquadCreateDraft, rows: readonly AgentPresetRow[]):
  'memberIdRequired' | 'memberIdInvalid' | 'memberIdTaken' | 'memberNameRequired' | 'personaRequired' | undefined {
  if (draft.id === '') return 'memberIdRequired'
  if (!MEMBER_ID.test(draft.id)) return 'memberIdInvalid'
  if (rows.some(row => row.id === draft.id)) return 'memberIdTaken'
  if (draft.name.trim() === '') return 'memberNameRequired'
  if (draft.persona.trim() === '') return 'personaRequired'
  return undefined
}

type SquadRemote = Pick<ClientRemote, 'agentPresets' | 'squadDraft'>

/** Coordinates list, edit, avatar, delete, and reviewed AI-draft operations. */
export class SquadManagerController {
  /** Observable state consumed by the React surface. */
  readonly store: SnapshotStore<SquadManagerState> = createSnapshotStore(INITIAL)

  constructor(
    private readonly remote: SquadRemote,
    private readonly changed: () => void = () => {},
  ) {}

  private set(patch: Partial<SquadManagerState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  private patchEdit(patch: Partial<SquadEditDraft>): void {
    const edit = this.store.getSnapshot().edit
    if (edit !== null) this.set({ edit: { ...edit, ...patch } })
  }

  private patchCreate(patch: Partial<SquadCreateDraft>): void {
    const create = this.store.getSnapshot().create
    if (create !== null) this.set({ create: { ...create, ...patch } })
  }

  /** Read the effective roster and UI-only avatars. */
  async load(): Promise<void> {
    if (this.store.getSnapshot().status === 'loading') return
    this.set({ status: 'loading', error: null })
    try {
      const result = await this.remote.agentPresets.list()
      if (!result.ok) {
        this.set({ status: 'error', error: result.error.message })
        return
      }
      const rows = result.value.presets
        .filter(row => row.squadMember)
        .sort((left, right) => {
          const order = (left.order ?? Number.POSITIVE_INFINITY) - (right.order ?? Number.POSITIVE_INFINITY)
          return Number.isNaN(order) || order === 0 ? left.id.localeCompare(right.id) : order
        })
      const avatarEntries = await Promise.all(rows.map(async (row) => {
        if (row.avatar === undefined) return [row.id, undefined] as const
        const avatar = await this.remote.agentPresets.readAvatar(row.id)
        return [row.id, avatar.ok ? avatar.value : undefined] as const
      }))
      const avatars = Object.fromEntries(avatarEntries.filter(
        (entry): entry is readonly [string, SquadAvatar] => entry[1] !== undefined))
      this.set({
        status: rows.length === 0 && !result.value.authorable ? 'unavailable' : 'ready',
        authorable: result.value.authorable,
        maxAvatarBytes: result.value.maxAvatarBytes,
        rows,
        avatars,
      })
    } catch (error) {
      this.set({ status: 'error', error: messageOf(error) })
    }
  }

  /**
   * Open the bounded editor over one effective member.
   * @param id - Member id to edit.
   */
  beginEdit(id: string): void {
    const row = this.store.getSnapshot().rows.find(candidate => candidate.id === id)
    if (row === undefined || row.persona === undefined) return
    this.set({
      edit: {
        id, name: row.name ?? id, persona: row.persona, tools: row.tools.join(', '),
        revision: row.revision, resettable: row.trust === 'system' && row.personaOverridden,
        saving: false, error: null,
      },
    })
  }

  /**
   * Patch editable persona text.
   * @param persona - Exact pending persona text.
   */
  setEditPersona(persona: string): void { this.patchEdit({ persona, error: null }) }

  /**
   * Patch restrict-only tool names.
   * @param tools - Comma-separated pending deny entries.
   */
  setEditTools(tools: string): void { this.patchEdit({ tools, error: null }) }

  /** Close the persona editor. */
  cancelEdit(): void { this.set({ edit: null }) }

  /** Commit reviewed persona text and restrictions conditionally. */
  async saveEdit(): Promise<void> {
    const edit = this.store.getSnapshot().edit
    if (edit === null || edit.saving || edit.persona.trim() === '') return
    this.patchEdit({ saving: true, error: null })
    try {
      const result = await this.remote.agentPresets.savePersona(
        edit.id, edit.persona, parseToolRestrictions(edit.tools), edit.revision)
      if (!result.ok) {
        this.patchEdit({ saving: false, error: result.error.message })
        return
      }
      this.set({ edit: null })
      await this.load()
      this.changed()
    } catch (error) {
      this.patchEdit({ saving: false, error: messageOf(error) })
    }
  }

  /** Restore a shipped member's persona and base restrictions. */
  async resetEdit(): Promise<void> {
    const edit = this.store.getSnapshot().edit
    if (edit === null || edit.saving || !edit.resettable || edit.revision === null) return
    this.patchEdit({ saving: true, error: null })
    try {
      const result = await this.remote.agentPresets.resetPersona(edit.id, edit.revision)
      if (!result.ok) {
        this.patchEdit({ saving: false, error: result.error.message })
        return
      }
      this.set({ edit: null })
      await this.load()
      this.changed()
    } catch (error) {
      this.patchEdit({ saving: false, error: messageOf(error) })
    }
  }

  /** Open the create flow before any model call occurs. */
  beginCreate(): void {
    this.set({
      create: {
        step: 'describe', descriptionPrompt: '', id: '', name: '', description: '', persona: '', tools: '',
        drafting: false, saving: false, error: null,
      },
    })
  }

  /**
   * Patch any user-editable create field.
   * @param field - Field to replace.
   * @param value - New field value.
   */
  setCreate<K extends 'descriptionPrompt' | 'id' | 'name' | 'description' | 'persona' | 'tools'>(
    field: K, value: SquadCreateDraft[K],
  ): void { this.patchCreate({ [field]: value, error: null }) }

  /** Close the create flow without committing. */
  cancelCreate(): void { this.set({ create: null }) }

  /** Make the one explicit, tool-free draft call and advance to review. */
  async draftCreate(): Promise<void> {
    const create = this.store.getSnapshot().create
    if (create === null || create.drafting || create.descriptionPrompt.trim() === '') return
    this.patchCreate({ drafting: true, error: null })
    try {
      const result = await this.remote.squadDraft.draft(create.descriptionPrompt, undefined)
      if (!result.ok) {
        this.patchCreate({ drafting: false, error: result.error.message })
        return
      }
      const draft = result.value
      this.patchCreate({
        step: 'review', drafting: false, name: draft.name, description: draft.description,
        persona: draft.persona, tools: draft.toolsDenySuggestion.join(', '),
      })
    } catch (error) {
      this.patchCreate({ drafting: false, error: messageOf(error) })
    }
  }

  /** Commit only the reviewed fields; drafting itself never writes. */
  async saveCreate(): Promise<void> {
    const create = this.store.getSnapshot().create
    if (create === null || create.saving || createBlocker(create, this.store.getSnapshot().rows) !== undefined) return
    this.patchCreate({ saving: true, error: null })
    try {
      const result = await this.remote.agentPresets.createMember(create.id, {
        name: create.name.trim(),
        ...(create.description.trim() === '' ? {} : { description: create.description.trim() }),
        persona: create.persona,
        toolsDeny: parseToolRestrictions(create.tools),
      })
      if (!result.ok) {
        this.patchCreate({ saving: false, error: result.error.message })
        return
      }
      this.set({ create: null })
      await this.load()
      this.changed()
    } catch (error) {
      this.patchCreate({ saving: false, error: messageOf(error) })
    }
  }

  /**
   * Replace one member's avatar through its current conditional revision.
   * @param id - Member id.
   * @param mediaType - Browser image media type.
   * @param base64 - Base64-encoded image bytes.
   */
  async saveAvatar(id: string, mediaType: SquadAvatar['mediaType'], base64: string): Promise<void> {
    const row = this.store.getSnapshot().rows.find(candidate => candidate.id === id)
    if (row === undefined) return
    try {
      const result = await this.remote.agentPresets.saveAvatar(id, mediaType, base64, row.revision)
      if (!result.ok) {
        this.set({ error: result.error.message })
        return
      }
      await this.load()
      this.changed()
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  /**
   * Stage or dismiss deletion of one user-owned member.
   * @param id - Member id, or null to dismiss.
   */
  confirmDelete(id: string | null): void { this.set({ pendingDelete: id }) }

  /**
   * Surface a browser-side file admission failure.
   * @param message - Localized failure text.
   */
  reportError(message: string): void { this.set({ error: message }) }

  /** Delete the staged user member and re-read the effective roster. */
  async remove(): Promise<void> {
    const id = this.store.getSnapshot().pendingDelete
    if (id === null) return
    try {
      const result = await this.remote.agentPresets.deleteMember(id)
      if (!result.ok) {
        this.set({ pendingDelete: null, error: result.error.message })
        return
      }
      this.set({ pendingDelete: null })
      await this.load()
      this.changed()
    } catch (error) {
      this.set({ pendingDelete: null, error: messageOf(error) })
    }
  }
}

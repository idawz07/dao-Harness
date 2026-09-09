/** Settings UI for bounded squad-member personalization and creation. */

import { useEffect } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { Button, IconEditOutline16, IconPlusOutline16, IconTrashOutline16, Modal } from '@daoai/dao-client-ui-primitives'
import type { SnapshotStore } from '@daoai/dao-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@daoai/dao-client-ui-slots'
import { createBlocker, type SquadManagerState } from './squad-store.ts'
import css from './SquadManager.module.css'

/** Registration-side business face for squad management. */
export interface SquadManagerInjected {
  hooks: { squadManager: SnapshotStore<SquadManagerState> }
  load: () => Promise<void>
  beginEdit: (id: string) => void
  setEditPersona: (value: string) => void
  setEditTools: (value: string) => void
  cancelEdit: () => void
  saveEdit: () => Promise<void>
  resetEdit: () => Promise<void>
  beginCreate: () => void
  setCreate: (field: 'descriptionPrompt' | 'id' | 'name' | 'description' | 'persona' | 'tools', value: string) => void
  cancelCreate: () => void
  draftCreate: () => Promise<void>
  saveCreate: () => Promise<void>
  saveAvatar: (id: string, mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif', base64: string) => Promise<void>
  reportError: (message: string) => void
  confirmDelete: (id: string | null) => void
  remove: () => Promise<void>
}

/** Full squad-manager props. */
export type SquadManagerProps = PropsRuntime<'settings.section'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<SquadManagerInjected>

/** Read one browser file into the path-free avatar wire payload. */
export async function avatarPayload(
  file: File,
  maxBytes: number,
): Promise<{ mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; base64: string }> {
  const supported = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
  if (!supported.some(value => value === file.type)) throw new Error('unsupported-avatar-media-type')
  if (file.size === 0 || file.size > maxBytes) throw new Error('avatar-size-invalid')
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('avatar-read-failed'))
    })
    reader.addEventListener('error', () => { reject(reader.error ?? new Error('avatar-read-failed')) })
    reader.readAsDataURL(file)
  })
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('avatar-read-failed')
  return { mediaType: file.type as (typeof supported)[number], base64: dataUrl.slice(comma + 1) }
}

function field(
  label: string,
  value: string,
  onChange: (value: string) => void,
  options: { area?: boolean; placeholder?: string; autoFocus?: boolean } = {},
): ReactNode {
  const common = {
    className: options.area === true ? css.textarea as string : css.input as string,
    value,
    placeholder: options.placeholder,
    autoFocus: options.autoFocus,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { onChange(event.target.value) },
  }
  return (
    <label className={css.field}>
      <span className={css.fieldLabel}>{label}</span>
      {options.area === true ? <textarea {...common} rows={8} /> : <input {...common} />}
    </label>
  )
}

/** Render the squad roster and reviewed authoring dialogs. */
export function SquadManager(props: SquadManagerProps): ReactNode {
  const { useSquadManager, t } = props
  const state = useSquadManager(snapshot => snapshot)
  useEffect(() => { void props.load() }, [props.load])
  if (state.status === 'unavailable') return null
  if (state.status === 'error') {
    return (
      <div className={css.section}>
        <p className={css.error} role="alert">{state.error ?? t('squadLoadError')}</p>
        <Button variant="outline" onClick={() => { void props.load() }}>{t('retry')}</Button>
      </div>
    )
  }

  const edit = state.edit
  const create = state.create
  const blocker = create === null || create.step !== 'review' ? undefined : createBlocker(create, state.rows)
  const deleteRow = state.rows.find(row => row.id === state.pendingDelete)

  return (
    <div className={css.section}>
      <div className={css.headingRow}>
        <div>
          <h2 className={css.title}>{t('squadTitle')}</h2>
          <p className={css.intro}>{t('squadIntro')}</p>
        </div>
        <Button disabled={!state.authorable} onClick={() => { props.beginCreate() }}>
          <IconPlusOutline16 /> {t('squadCreate')}
        </Button>
      </div>
      {state.error === null ? null : <p className={css.error} role="alert">{state.error}</p>}
      {state.status === 'loading' ? <p className={css.intro}>{t('loading')}</p> : null}
      <ul className={css.cards}>
        {state.rows.map((row) => {
          const name = row.name ?? row.id
          const avatar = state.avatars[row.id]
          return (
            <li className={css.card} key={row.id}>
              <div className={css.avatar} aria-hidden="true">
                {avatar === undefined
                  ? name.slice(0, 1).toUpperCase()
                  : <img alt="" src={`data:${avatar.mediaType};base64,${avatar.base64}`} />}
              </div>
              <div className={css.memberBody}>
                <div className={css.memberHead}>
                  <span className={css.memberName}>{name}</span>
                  <span className={css.badge}>{row.trust === 'system' ? t('squadBuiltIn') : t('squadCustom')}</span>
                  {row.personaOverridden ? <span className={css.badge}>{t('squadPersonalized')}</span> : null}
                </div>
                <p className={css.description}>{row.description ?? t('noDescription')}</p>
                <code className={css.memberId}>{row.id}</code>
                <div className={css.actions}>
                  <Button variant="outline" disabled={row.broken !== undefined || row.persona === undefined} onClick={() => { props.beginEdit(row.id) }}>
                    <IconEditOutline16 /> {row.personaOverridden ? t('squadEdit') : t('squadPersonalize')}
                  </Button>
                  <label className={css.uploadButton}>
                    {t('squadAvatar')}
                    <input
                      className={css.fileInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (file === undefined) return
                        void avatarPayload(file, state.maxAvatarBytes)
                          .then(async (payload) => { await props.saveAvatar(row.id, payload.mediaType, payload.base64) })
                          .catch(() => { props.reportError(t('squadAvatarError')) })
                      }}
                    />
                  </label>
                  {row.trust === 'user'
                    ? <Button variant="outline" onClick={() => { props.confirmDelete(row.id) }}><IconTrashOutline16 /> {t('delete')}</Button>
                    : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <Modal
        open={edit !== null}
        onClose={props.cancelEdit}
        title={edit === null ? t('squadEditTitle') : `${t('squadEditTitle')} · ${edit.name}`}
        closeLabel={t('close')}
        description={t('squadEditIntro')}
        className={css.dialog as string}
        footer={(
          <>
            {edit?.resettable === true
              ? <Button variant="outline" disabled={edit.saving} onClick={() => { void props.resetEdit() }}>{t('squadReset')}</Button>
              : null}
            <Button variant="outline" disabled={edit?.saving === true} onClick={props.cancelEdit}>{t('cancel')}</Button>
            <Button disabled={edit === null || edit.saving || edit.persona.trim() === ''} onClick={() => { void props.saveEdit() }}>
              {edit?.saving === true ? t('squadSaving') : t('squadSave')}
            </Button>
          </>
        )}
      >
        {edit === null ? null : (
          <div className={css.dialogFields}>
            {field(t('squadPersona'), edit.persona, props.setEditPersona, { area: true, autoFocus: true })}
            <p className={css.help}>{t('squadPersonaHelp')}</p>
            {field(t('squadToolRestrictions'), edit.tools, props.setEditTools, { placeholder: t('squadToolPlaceholder') })}
            <p className={css.help}>{t('squadToolHelp')}</p>
            {edit.error === null ? null : <p className={css.error} role="alert">{edit.error}</p>}
          </div>
        )}
      </Modal>

      <Modal
        open={create !== null}
        onClose={props.cancelCreate}
        title={t('squadCreateTitle')}
        closeLabel={t('close')}
        description={create?.step === 'review' ? t('squadReviewIntro') : t('squadDraftIntro')}
        className={css.dialog as string}
        footer={(
          <>
            <Button variant="outline" disabled={create?.drafting === true || create?.saving === true} onClick={props.cancelCreate}>{t('cancel')}</Button>
            {create?.step === 'describe'
              ? (
                <Button disabled={create.descriptionPrompt.trim() === '' || create.drafting} onClick={() => { void props.draftCreate() }}>
                  {create.drafting ? t('squadDrafting') : t('squadDraftAction')}
                </Button>
              )
              : (
                <Button disabled={create === null || create.saving || blocker !== undefined} onClick={() => { void props.saveCreate() }}>
                  {create?.saving === true ? t('squadSaving') : t('squadCreateMember')}
                </Button>
              )}
          </>
        )}
      >
        {create === null ? null : create.step === 'describe'
          ? (
            <div className={css.dialogFields}>
              {field(t('squadDescribe'), create.descriptionPrompt, (value) => { props.setCreate('descriptionPrompt', value) }, { area: true, autoFocus: true, placeholder: t('squadDescribePlaceholder') })}
              {create.error === null ? null : <p className={css.error} role="alert">{create.error}</p>}
            </div>
          )
          : (
            <div className={css.dialogFields}>
              {field(t('presetId'), create.id, (value) => { props.setCreate('id', value) }, { autoFocus: true, placeholder: t('presetIdPlaceholder') })}
              {field(t('displayName'), create.name, (value) => { props.setCreate('name', value) })}
              {field(t('squadRoleDescription'), create.description, (value) => { props.setCreate('description', value) })}
              {field(t('squadPersona'), create.persona, (value) => { props.setCreate('persona', value) }, { area: true })}
              {field(t('squadToolRestrictions'), create.tools, (value) => { props.setCreate('tools', value) }, { placeholder: t('squadToolPlaceholder') })}
              <p className={css.help}>{t('squadReviewHelp')}</p>
              {create.error !== null
                ? <p className={css.error} role="alert">{create.error}</p>
                : blocker === undefined ? null : <p className={css.error} role="alert">{t(blocker)}</p>}
            </div>
          )}
      </Modal>

      <Modal
        open={deleteRow !== undefined}
        onClose={() => { props.confirmDelete(null) }}
        title={t('squadDeleteTitle')}
        closeLabel={t('close')}
        description={deleteRow === undefined ? '' : `${t('squadDeleteDescription')} ${deleteRow.name ?? deleteRow.id}`}
        footer={(
          <>
            <Button variant="outline" onClick={() => { props.confirmDelete(null) }}>{t('cancel')}</Button>
            <Button onClick={() => { void props.remove() }}>{t('deleteConfirm')}</Button>
          </>
        )}
      />
    </div>
  )
}

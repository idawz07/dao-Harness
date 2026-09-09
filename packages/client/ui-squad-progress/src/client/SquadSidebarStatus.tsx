import { clsx } from 'clsx'
import { IconSparkle16 } from '@daoai/dao-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@daoai/dao-client-ui-slots'
import type {} from '@daoai/dao-client-ui-sidebar/client'
import type {} from '@daoai/dao-client-ui-session/client'
import { NS } from './locales.ts'
import css from './SquadSidebarStatus.module.css'

/** Action supplied by the squad-progress registration. */
export interface SquadSidebarStatusInjected {
  /** Open the keyed squad progress details surface. */
  openSquadDetails: () => void
}

/** Composed sidebar footer squad status props. */
export type SquadSidebarStatusProps =
  PropsRuntime<'sidebar.footer.action'>
  & SquadSidebarStatusInjected
  & PropsLocale<typeof NS>

/**
 * Render the squad status at the sidebar footer. Wide renders a labelled row
 * (level and member count for the current session); the rail renders a compact
 * glyph. Absent while no session is selected.
 */
export function SquadSidebarStatus({ useSessions, wide, openSquadDetails, t }: SquadSidebarStatusProps) {
  const currentId = useSessions(s => s.current)
  const progress = useSessions(
    s => (s.current === undefined ? undefined : s.byId[s.current]?.projectionValues?.squadProgress),
  )
  const members = useSessions((s) => {
    if (s.current === undefined) return 0
    const catalog = s.subagentsByParent[s.current]
    if (catalog === undefined || catalog.state !== 'ready') return 0
    return catalog.entries.reduce((count, entry) => count + (entry.kind === 'child' ? 1 : 0), 0)
  })
  if (currentId === undefined) return null
  const level = progress?.level
  const label = members === 0
    ? t('sidebar.none')
    : t(members === 1 ? 'sidebar.members.one' : 'sidebar.members.other', { count: members })
  const aria = level === undefined
    ? t('sidebar.title')
    : `${t('sidebar.title')}: ${t('rank.level', { level })}, ${label}`
  return (
    <button
      type="button"
      className={clsx(css.row, 'squad-sidebar-status')}
      aria-label={aria}
      title={aria}
      onClick={openSquadDetails}
    >
      <span className={css.icon} aria-hidden="true">
        <IconSparkle16 size={16} />
      </span>
      {wide && (
        <span className={css.body}>
          <span className={css.title}>{t('sidebar.title')}</span>
          <span className={css.meta}>
            {level === undefined ? t('sidebar.none') : (
              <>
                {t('rank.level', { level })}
                <span className={css.dot} aria-hidden="true" />
                {label}
              </>
            )}
          </span>
        </span>
      )}
    </button>
  )
}

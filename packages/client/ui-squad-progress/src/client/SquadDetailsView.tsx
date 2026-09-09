import { useMemo } from 'react'
import {
  IconCheckOutline14, IconCloseOutline16, IconSparkle16, StateDot,
} from '@daoai/dao-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@daoai/dao-client-ui-slots'
import type { SubagentListEntry } from '@daoai/dao-subagent/client'
import type {} from '@daoai/dao-client-ui-chat/client'
import type {} from '@daoai/dao-client-ui-session/client'
import { levelProgress, xpToNextLevel } from './level-progress.ts'
import { BADGE_KEYS, NS } from './locales.ts'
import css from './SquadDetailsView.module.css'

/** One resolved member row for the roster. */
interface MemberRow {
  id: string
  label: string
  activity: 'running' | 'inactive'
  level: number | undefined
}

/**
 * Owner values plus the keyed slot's session standard kit. Registered under
 * the `squad` key; rendered only when the details surface is `squad`.
 */
export type SquadDetailsViewProps =
  PropsRuntime<'conversation.details.view'>
  & PropsLocale<typeof NS>

/**
 * Render the squad progress details surface: rank and next-level progress for
 * the current session, its member roster, earned achievements, and the XP
 * rules. Absent projection renders the empty state.
 */
export function SquadDetailsView({ sessionId, useProjection, useSessions, closeDetails, t }: SquadDetailsViewProps) {
  const progress = useProjection('squadProgress')
  const catalog = useSessions(s => s.subagentsByParent[sessionId])
  const byId = useSessions(s => s.byId)
  const rows = useMemo<MemberRow[]>(() => {
    if (catalog === undefined || catalog.state !== 'ready') return []
    return catalog.entries
      .filter((entry): entry is Extract<SubagentListEntry, { kind: 'child' }> => entry.kind === 'child')
      .map((entry) => {
        const summary = byId[entry.id]
        const label = entry.label !== undefined && entry.label !== ''
          ? entry.label
          : summary?.displayTitle ?? entry.id
        return {
          id: entry.id,
          label,
          activity: entry.activity,
          level: summary?.projectionValues?.squadProgress?.level,
        }
      })
  }, [catalog, byId])
  const rosterState = catalog === undefined ? 'loading' : catalog.state

  return (
    <div className={css.root}>
      <header className={css.header}>
        <span className={css.headerIcon} aria-hidden="true">
          <IconSparkle16 size={16} />
        </span>
        <div className={css.title}>{t('details.title')}</div>
        <button
          type="button"
          className={css.close}
          aria-label={t('details.close')}
          onClick={closeDetails}
        >
          <IconCloseOutline16 size={14} />
        </button>
      </header>
      <div className={css.body}>
        {progress === undefined ? (
          <div className={css.empty}>{t('details.empty')}</div>
        ) : (
          <>
            <section className={css.card}>
              <div className={css.rankHead}>
                <span className={css.rankLevel}>{t('rank.level', { level: progress.level })}</span>
                <span className={css.rankXp}>{t('rank.xp', { xp: progress.xp })}</span>
              </div>
              <div
                className={css.track}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(levelProgress(progress.xp, progress.level) * 100)}
                aria-label={t('rank.progress', { level: progress.level + 1 })}
              >
                <div className={css.fill} style={{ width: `${Math.round(levelProgress(progress.xp, progress.level) * 100)}%` }} />
              </div>
              <div className={css.rankNext}>
                {t('rank.next', { xp: xpToNextLevel(progress.xp, progress.level), level: progress.level + 1 })}
              </div>
            </section>

            <section className={css.card}>
              <h2 className={css.sectionTitle}>{t('roster.title')}</h2>
              {rosterState === 'loading' ? (
                <div className={css.muted}>{t('roster.loading')}</div>
              ) : rosterState === 'error' ? (
                <div className={css.muted}>{t('roster.unavailable')}</div>
              ) : rows.length === 0 ? (
                <div className={css.muted}>{t('roster.empty')}</div>
              ) : (
                <ul className={css.roster}>
                  {rows.map(row => (
                    <li key={row.id} className={css.rosterRow}>
                      <StateDot state={row.activity === 'running' ? 'ongoing' : 'done'} size={8} />
                      <span className={css.rosterLabel}>{row.label}</span>
                      {row.activity === 'running' && (
                        <span className={css.rosterState}>{t('roster.running')}</span>
                      )}
                      <span className={css.rosterLevel}>
                        {row.level === undefined ? '—' : t('roster.level', { level: row.level })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={css.card}>
              <h2 className={css.sectionTitle}>{t('achievements.title')}</h2>
              {progress.badges.length === 0 ? (
                <div className={css.muted}>{t('achievements.empty')}</div>
              ) : (
                <ul className={css.badges}>
                  {progress.badges.map(badge => (
                    <li key={badge} className={css.badge}>
                      <span className={css.badgeIcon} aria-hidden="true">
                        <IconCheckOutline14 size={14} />
                      </span>
                      {t(BADGE_KEYS[badge])}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={css.card}>
              <h2 className={css.sectionTitle}>{t('note.title')}</h2>
              <ul className={css.note}>
                <li>{t('note.tool')}</li>
                <li>{t('note.spawn')}</li>
                <li>{t('note.settled')}</li>
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

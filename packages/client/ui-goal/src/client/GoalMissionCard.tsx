import { IconGoalOutline16 } from '@daoai/dao-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@daoai/dao-client-ui-slots'
import type { GoalPhase } from '@daoai/dao-goal/client'
import type {} from '@daoai/dao-client-ui-conversation/client'
import type {} from '@daoai/dao-client-ui-session/client'
import type { GoalKey } from './locales.ts'
import css from './GoalMissionCard.module.css'

const PHASE_KEYS = {
  active: 'phase.active',
  paused: 'phase.paused',
  blocked: 'phase.blocked',
  complete: 'phase.complete',
} as const satisfies Record<GoalPhase, GoalKey>

/** Composed props for the goal-owned Session mission summary. */
export type GoalMissionCardProps =
  PropsRuntime<'conversation.session.header.mission'> & PropsLocale<'goal'>

/** Render the durable goal objective, phase, and admitted-round progress. */
export function GoalMissionCard({ useProjection, t }: GoalMissionCardProps) {
  const projection = useProjection('goal')
  if (projection == null) return null

  const { goal } = projection
  const maxRounds = Math.max(1, goal.maxGoalRounds)
  const rounds = Math.min(maxRounds, Math.max(0, projection.roundsStarted))
  const percent = goal.phase === 'complete'
    ? 100
    : Math.round((rounds / maxRounds) * 100)

  return (
    <section className={css.card} aria-label={t('mission.label')} data-goal-mission>
      <div className={css.headingRow}>
        <div className={css.eyebrow}>
          <IconGoalOutline16 size={14} />
          <span>{t('mission.label')}</span>
        </div>
        <span className={css.phase} data-phase={goal.phase}>{t(PHASE_KEYS[goal.phase])}</span>
      </div>
      <h1 className={css.objective}>{goal.objective}</h1>
      {goal.phase === 'blocked' && goal.blockedReason !== undefined && (
        <p className={css.reason}>{goal.blockedReason.message}</p>
      )}
      <div className={css.progressMeta}>
        <span>{t('mission.progress')}</span>
        <span>{t('mission.rounds', { rounds, max: maxRounds })}</span>
      </div>
      <div
        className={css.track}
        role="progressbar"
        aria-label={t('mission.progressAria', { rounds, max: maxRounds })}
        aria-valuemin={0}
        aria-valuemax={maxRounds}
        aria-valuenow={rounds}
      >
        <span className={css.fill} style={{ width: `${String(percent)}%` }} />
      </div>
    </section>
  )
}

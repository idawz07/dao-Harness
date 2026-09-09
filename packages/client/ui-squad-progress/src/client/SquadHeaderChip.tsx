import { clsx } from 'clsx'
import { IconSparkle16 } from '@daoai/dao-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@daoai/dao-client-ui-slots'
import type {} from '@daoai/dao-client-ui-conversation/client'
import type {} from '@daoai/dao-client-ui-session/client'
import { levelProgress } from './level-progress.ts'
import { NS } from './locales.ts'
import css from './SquadHeaderChip.module.css'

/** Action supplied by the squad-progress registration. */
export interface SquadHeaderChipInjected {
  /** Open the keyed squad progress details surface. */
  openSquadDetails: () => void
}

/** Composed session-header squad chip props. */
export type SquadHeaderChipProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & SquadHeaderChipInjected
  & PropsLocale<typeof NS>

/**
 * Render the compact XP/level chip in the Session header. Absent while the
 * session has no `squadProgress` projection (capability unmounted or not yet
 * baselined).
 */
export function SquadHeaderChip({ useProjection, openSquadDetails, t }: SquadHeaderChipProps) {
  const progress = useProjection('squadProgress')
  if (progress === undefined) return null
  const { xp, level } = progress
  const fraction = levelProgress(xp, level)
  return (
    <button
      type="button"
      className={clsx(css.chip, 'squad-header-chip')}
      title={t('header.open')}
      aria-label={t('header.aria', { level, xp })}
      onClick={openSquadDetails}
    >
      <span className={css.icon} aria-hidden="true">
        <IconSparkle16 size={14} />
      </span>
      <span className={css.level}>{t('header.levelCompact', { level })}</span>
      <span className={css.track} aria-hidden="true">
        <span className={css.fill} style={{ width: `${Math.round(fraction * 100)}%` }} />
      </span>
    </button>
  )
}

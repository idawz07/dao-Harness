import { useEffect, useRef, useState } from 'react'
import { IconSparkle16, Toast } from '@daoai/dao-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@daoai/dao-client-ui-slots'
import type { SessionId } from '@daoai/dao-session/types'
import type {} from '@daoai/dao-client-ui-layout/client'
import type {} from '@daoai/dao-client-ui-session/client'
import type { SquadBadgeId, SquadProgressProjection } from '@daoai/dao-squad-progress/client'
import { BADGE_KEYS, NS } from './locales.ts'

/** Achievement toast full-opacity hold before the fade. */
const TOAST_HOLD_MS = 4000

/** One pending achievement banner. */
interface ToastState {
  badge: SquadBadgeId
  seq: number
  sessionId: SessionId
}

/**
 * Composed shell-overlay achievement toast props. Root scope: reads the
 * current session's squad progress from the session list.
 */
export type SquadAchievementToastProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>

/**
 * Announce a newly earned badge for the current session. The first sighting of
 * a session baselines its earned badges (no banner); only badges added after
 * the baseline fire a toast, so pre-existing badges never replay on mount or
 * on a session switch back.
 */
export function SquadAchievementToast({ useSessions, t }: SquadAchievementToastProps) {
  const currentId = useSessions(s => s.current)
  const progress: SquadProgressProjection | undefined = useSessions(
    s => (s.current === undefined ? undefined : s.byId[s.current]?.projectionValues?.squadProgress),
  )
  const baselineRef = useRef<Map<SessionId, readonly SquadBadgeId[]>>(new Map())
  const activeSessionRef = useRef<SessionId | undefined>(undefined)
  const queueRef = useRef<SquadBadgeId[]>([])
  const sequenceRef = useRef(0)
  const [toast, setToast] = useState<ToastState | null>(null)

  useEffect(() => {
    if (activeSessionRef.current !== currentId) {
      activeSessionRef.current = currentId
      queueRef.current = []
      setToast(null)
    }
    if (progress === undefined || currentId === undefined) return
    const baseline = baselineRef.current.get(currentId)
    const badges = progress.badges
    if (baseline === undefined) {
      baselineRef.current.set(currentId, badges)
      return
    }
    const fresh = badges.filter(badge => !baseline.includes(badge))
    if (fresh.length === 0) return
    baselineRef.current.set(currentId, badges)
    queueRef.current.push(...fresh)
    setToast((previous) => {
      if (previous !== null) return previous
      const badge = queueRef.current.shift() as SquadBadgeId
      sequenceRef.current += 1
      return { badge, seq: sequenceRef.current, sessionId: currentId }
    })
  }, [progress, currentId])

  if (toast === null) return null
  return (
    <Toast
      key={toast.seq}
      text={t('toast.earned', { badge: t(BADGE_KEYS[toast.badge]) })}
      icon={<IconSparkle16 size={16} />}
      holdMs={TOAST_HOLD_MS}
      onDone={() => {
        setToast((previous) => {
          /* v8 ignore next -- A retained completion can run after a session switch clears the active toast. */
          if (previous === null) return null
          const badge = queueRef.current.shift()
          if (badge === undefined) return null
          sequenceRef.current += 1
          return { badge, seq: sequenceRef.current, sessionId: previous.sessionId }
        })
      }}
    />
  )
}

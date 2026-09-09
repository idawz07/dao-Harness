// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@daoai/dao-client-test-runtime'
import type {
  SessionListState, SessionSummary,
} from '@daoai/dao-api-session-controller/client'
import type { SessionId } from '@daoai/dao-session/types'
import type { SquadProgressProjection } from '@daoai/dao-squad-progress/client'
import type {} from '@daoai/dao-client-ui-chat/client'
import type {} from '@daoai/dao-client-ui-conversation/client'
import type {} from '@daoai/dao-client-ui-layout/client'
import type {} from '@daoai/dao-client-ui-session/client'
import type {} from '@daoai/dao-client-ui-sidebar/client'
import { SquadAchievementToast, type SquadAchievementToastProps } from '../src/client/SquadAchievementToast.tsx'
import { SquadDetailsView, type SquadDetailsViewProps } from '../src/client/SquadDetailsView.tsx'
import { SquadHeaderChip, type SquadHeaderChipProps } from '../src/client/SquadHeaderChip.tsx'
import { SquadSidebarStatus, type SquadSidebarStatusProps } from '../src/client/SquadSidebarStatus.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const SID = 's1' as SessionId
const t = makeTranslate(en)

interface Member {
  id: SessionId
  level?: number
  running?: boolean
}

/** One session list state: the current session plus its squad progress, member summaries, and child catalog. */
function buildState(opts: {
  progress?: SquadProgressProjection | undefined
  members?: Member[]
  catalogState?: 'ready' | 'loading' | 'error'
  current?: SessionId | undefined
} = {}): SessionListState {
  const { progress, members = [], catalogState = 'ready' } = opts
  const current = 'current' in opts ? opts.current : SID
  const byId: Record<string, SessionSummary> = {}
  if (current !== undefined) {
    byId[current] = {
      id: current,
      displayTitle: 'Mission control',
      running: true,
      blank: false,
      updatedAt: Date.now(),
      ...(progress === undefined ? {} : { projectionValues: { squadProgress: progress } }),
    }
  }
  for (const member of members) {
    byId[member.id] = {
      id: member.id,
      displayTitle: member.id,
      parentId: SID,
      origin: 'subagent',
      running: member.running ?? false,
      blank: false,
      updatedAt: Date.now(),
      ...(member.level === undefined ? {} : {
        projectionValues: { squadProgress: { xp: member.level, level: member.level, badges: [] } },
      }),
    }
  }
  return {
    ids: [SID, ...members.map(member => member.id)],
    byId,
    current,
    phase: 'ready',
    subagentsByParent: {
      [SID]: {
        entries: members.map(member => ({
          kind: 'child', id: member.id, mode: 'one-shot',
          activity: member.running ? 'running' : 'inactive', hasChildren: false,
        })),
        parentAvailable: true,
        state: catalogState,
        error: null,
      },
    },
    jobsBySession: {},
    currentAddress: undefined,
  } as unknown as SessionListState
}

function useSessionsOf(state: SessionListState) {
  return <T,>(select: (snapshot: SessionListState) => T): T => select(state)
}

function projectionOf(progress: SquadProgressProjection | undefined) {
  return (key: string) => (key === 'squadProgress' ? progress : undefined)
}

describe('SquadHeaderChip', () => {
  function chip(progress: SquadProgressProjection | undefined, open = vi.fn()) {
    return {
      sessionId: SID,
      useProjection: projectionOf(progress),
      useSessions: useSessionsOf(buildState({ progress })),
      openSquadDetails: open,
      t,
    } as unknown as SquadHeaderChipProps
  }

  it('renders nothing while the projection is absent', () => {
    render(<SquadHeaderChip {...chip(undefined)} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders the projected level and XP and opens the surface', () => {
    const open = vi.fn()
    render(<SquadHeaderChip {...chip({ xp: 25, level: 2, badges: [] }, open)} />)
    const button = screen.getByRole('button', { name: 'Squad progress: level 2, 25 XP' })
    fireEvent.click(button)
    expect(open).toHaveBeenCalledOnce()
  })
})

describe('SquadSidebarStatus', () => {
  function sidebar(state: SessionListState, wide: boolean, open = vi.fn()) {
    return {
      useSessions: useSessionsOf(state),
      wide,
      openSquadDetails: open,
      t,
    } as unknown as SquadSidebarStatusProps
  }

  it('renders nothing while no session is selected', () => {
    render(<SquadSidebarStatus {...sidebar(buildState({ current: undefined }), true)} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the level and the plural member count when the sidebar is wide', () => {
    const members = [{ id: 'a' as SessionId }, { id: 'b' as SessionId }]
    render(<SquadSidebarStatus {...sidebar(buildState({ progress: { xp: 25, level: 2, badges: [] }, members }), true)} />)
    expect(screen.getByRole('button', { name: 'Squad: Level 2, 2 members' })).toBeTruthy()
  })

  it('uses the singular member key for one member', () => {
    render(<SquadSidebarStatus {...sidebar(buildState({
      progress: { xp: 5, level: 1, badges: [] },
      members: [{ id: 'a' as SessionId }],
    }), true)} />)
    expect(screen.getByRole('button', { name: 'Squad: Level 1, 1 member' })).toBeTruthy()
  })

  it('notes the empty roster when the level is present', () => {
    render(<SquadSidebarStatus {...sidebar(buildState({ progress: { xp: 5, level: 1, badges: [] } }), true)} />)
    expect(screen.getByRole('button', { name: 'Squad: Level 1, No members yet' })).toBeTruthy()
  })

  it('opens the surface from the rail glyph', () => {
    const open = vi.fn()
    render(<SquadSidebarStatus {...sidebar(buildState({}), false, open)} />)
    fireEvent.click(screen.getByRole('button'))
    expect(open).toHaveBeenCalledOnce()
  })

  it('uses the compact title without progress and ignores unavailable or non-child catalog entries', () => {
    const absent = buildState({ catalogState: 'loading' })
    render(<SquadSidebarStatus {...sidebar(absent, true)} />)
    expect(screen.getByRole('button', { name: 'Squad' })).toBeTruthy()
    expect(screen.getByText('No members yet')).toBeTruthy()
    cleanup()

    const mixed = buildState({ progress: { xp: 5, level: 1, badges: [] } })
    Object.assign(mixed.subagentsByParent[SID]!, {
      entries: [{ kind: 'job', id: 'job-1', activity: 'inactive' }],
    })
    render(<SquadSidebarStatus {...sidebar(mixed, true)} />)
    expect(screen.getByRole('button', { name: 'Squad: Level 1, No members yet' })).toBeTruthy()

    const noCatalog = buildState({ progress: { xp: 5, level: 1, badges: [] } })
    const { [SID]: _catalog, ...subagentsByParent } = noCatalog.subagentsByParent
    cleanup()
    render(<SquadSidebarStatus {...sidebar({ ...noCatalog, subagentsByParent }, true)} />)
    expect(screen.getByRole('button', { name: 'Squad: Level 1, No members yet' })).toBeTruthy()
  })
})

describe('SquadDetailsView', () => {
  function details(progress: SquadProgressProjection | undefined, close = vi.fn(), members: Member[] = [], catalogState: 'ready' | 'loading' | 'error' = 'ready') {
    const state = buildState({ progress, members, catalogState })
    return {
      sessionId: SID,
      useProjection: projectionOf(progress),
      useSessions: useSessionsOf(state),
      closeDetails: close,
      t,
    } as unknown as SquadDetailsViewProps
  }

  it('renders the empty state while the projection is absent', () => {
    render(<SquadDetailsView {...details(undefined)} />)
    expect(screen.getByText('Squad progress appears as this session runs.')).toBeTruthy()
  })

  it('shows rank, next-level progress, members, achievements, and the XP rules', () => {
    const members = [{ id: 'a' as SessionId, running: true, level: 3 }]
    const close = vi.fn()
    render(<SquadDetailsView {...details({ xp: 25, level: 2, badges: ['first_delegation'] }, close, members)} />)

    expect(screen.getByText('Level 2')).toBeTruthy()
    expect(screen.getByText('25 XP')).toBeTruthy()
    expect(screen.getByText('15 XP to level 3')).toBeTruthy()
    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.getByText('a')).toBeTruthy()
    expect(screen.getByText('running')).toBeTruthy()
    expect(screen.getByText('Level 3')).toBeTruthy()
    expect(screen.getByText('First delegation')).toBeTruthy()
    expect(screen.getByText('How XP is earned')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close squad progress' }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('shows the loading roster while the catalog is still loading', () => {
    render(<SquadDetailsView {...details({ xp: 5, level: 1, badges: [] }, vi.fn(), [], 'loading')} />)
    expect(screen.getByText('Loading members…')).toBeTruthy()
  })

  it('shows an unavailable roster when the catalog fails', () => {
    render(<SquadDetailsView {...details({ xp: 5, level: 1, badges: [] }, vi.fn(), [], 'error')} />)
    expect(screen.getByText('Members are temporarily unavailable.')).toBeTruthy()
  })

  it('shows an empty ready roster and treats a missing catalog as loading', () => {
    const empty = details({ xp: 5, level: 1, badges: [] })
    render(<SquadDetailsView {...empty} />)
    expect(screen.getByText('No members yet')).toBeTruthy()
    cleanup()

    const state = buildState({ progress: { xp: 5, level: 1, badges: [] } })
    const { [SID]: _catalog, ...subagentsByParent } = state.subagentsByParent
    render(<SquadDetailsView {...{
      ...empty,
      useSessions: useSessionsOf({ ...state, subagentsByParent }),
    }} />)
    expect(screen.getByText('Loading members…')).toBeTruthy()
  })

  it('filters non-members and resolves roster labels, inactive state, and missing levels', () => {
    const progress = { xp: 5, level: 1, badges: [] } satisfies SquadProgressProjection
    const state = buildState({ progress })
    Object.assign(state.subagentsByParent[SID]!, {
      entries: [
        { kind: 'job', id: 'job-1', activity: 'inactive' },
        { kind: 'child', id: 'named', label: 'Named member', mode: 'one-shot', activity: 'inactive', hasChildren: false },
        { kind: 'child', id: 'fallback', label: '', mode: 'one-shot', activity: 'inactive', hasChildren: false },
      ],
    })
    render(<SquadDetailsView {...({
      sessionId: SID,
      useProjection: projectionOf(progress),
      useSessions: useSessionsOf(state),
      closeDetails: vi.fn(),
      t,
    } as unknown as SquadDetailsViewProps)} />)
    expect(screen.getByText('Named member')).toBeTruthy()
    expect(screen.getByText('fallback')).toBeTruthy()
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.queryByText('running')).toBeNull()
  })
})

describe('SquadAchievementToast', () => {
  function toast(state: SessionListState) {
    return {
      useSessions: useSessionsOf(state),
      t,
    } as unknown as SquadAchievementToastProps
  }

  it('baselines the first sighting without a banner', () => {
    render(<SquadAchievementToast {...toast(buildState({ progress: { xp: 1, level: 1, badges: ['first_delegation'] } }))} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('announces a badge earned after the baseline', () => {
    const view = render(<SquadAchievementToast {...toast(buildState({
      progress: { xp: 1, level: 1, badges: ['first_delegation'] },
    }))} />)
    expect(screen.queryByRole('alert')).toBeNull()

    view.rerender(<SquadAchievementToast {...toast(buildState({
      progress: { xp: 11, level: 1, badges: ['first_delegation', 'ten_tools'] },
    }))} />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Ten tools earned')).toBeTruthy()
  })

  it('announces every badge earned by the same progress update', async () => {
    vi.useFakeTimers()
    const view = render(<SquadAchievementToast {...toast(buildState({
      progress: { xp: 0, level: 1, badges: [] },
    }))} />)
    view.rerender(<SquadAchievementToast {...toast(buildState({
      progress: { xp: 12, level: 1, badges: ['first_delegation', 'ten_tools'] },
    }))} />)

    expect(screen.getByText('First delegation earned')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(screen.getByText('Ten tools earned')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clears the banner when its hold elapses', async () => {
    vi.useFakeTimers()
    const view = render(<SquadAchievementToast {...toast(buildState({
      progress: { xp: 1, level: 1, badges: ['first_delegation'] },
    }))} />)
    view.rerender(<SquadAchievementToast {...toast(buildState({
      progress: { xp: 11, level: 1, badges: ['first_delegation', 'ten_tools'] },
    }))} />)
    expect(screen.getByRole('alert')).toBeTruthy()

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ignores absent and unchanged progress and clears an active toast on session switch', () => {
    const view = render(<SquadAchievementToast {...toast(buildState({ progress: undefined }))} />)
    expect(screen.queryByRole('alert')).toBeNull()
    view.rerender(<SquadAchievementToast {...toast(buildState({
      progress: { xp: 1, level: 1, badges: [] },
    }))} />)
    view.rerender(<SquadAchievementToast {...toast(buildState({
      progress: { xp: 2, level: 1, badges: [] },
    }))} />)
    expect(screen.queryByRole('alert')).toBeNull()
    view.rerender(<SquadAchievementToast {...toast(buildState({ current: undefined }))} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('queues a newly earned badge behind the active toast', async () => {
    vi.useFakeTimers()
    const view = render(<SquadAchievementToast {...toast(buildState({
      progress: { xp: 0, level: 1, badges: [] },
    }))} />)
    view.rerender(<SquadAchievementToast {...toast(buildState({
      progress: { xp: 1, level: 1, badges: ['first_delegation'] },
    }))} />)
    view.rerender(<SquadAchievementToast {...toast(buildState({
      progress: { xp: 2, level: 1, badges: ['first_delegation', 'ten_tools'] },
    }))} />)
    expect(screen.getByText('First delegation earned')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(screen.getByText('Ten tools earned')).toBeTruthy()
  })
})

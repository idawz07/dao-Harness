/**
 * ui-squad-progress browser half on a real SlotRegistry: the plugin occupies
 * four declared seats — the session-header utilities list, the sidebar footer
 * action list, the keyed `squad` details view, and the shell overlay list —
 * and the injected face opens the `squad` surface through the layout service.
 * Teardown empties every seat (HMR safety).
 */
import { Context } from '@daoai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@daoai/dao-client-ui-renderer/client'
import { LocaleRuntime } from '@daoai/dao-client-locale/client'
import type {} from '@daoai/dao-client-ui-chat/client'
import type {} from '@daoai/dao-client-ui-conversation/client'
import type {} from '@daoai/dao-client-ui-layout/client'
import type {} from '@daoai/dao-client-ui-session/client'
import type {} from '@daoai/dao-client-ui-sidebar/client'
import { SquadAchievementToast } from '../src/client/SquadAchievementToast.tsx'
import { SquadDetailsView } from '../src/client/SquadDetailsView.tsx'
import { SquadHeaderChip } from '../src/client/SquadHeaderChip.tsx'
import { SquadSidebarStatus } from '../src/client/SquadSidebarStatus.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: {
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
      'conversation.details.view': { kind: 'keyed', scope: 'session' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  const openDetails = vi.fn()
  const closeDetails = vi.fn()
  ctx.provide('layout', { openDetails, closeDetails, toggleSidebar: vi.fn() })
  ctx.provide('locale', new LocaleRuntime(ctx))
  return { ctx, slots, openDetails, closeDetails }
}

type InjectFace = { openSquadDetails: () => void }

describe('ui-squad-progress browser apply', () => {
  it('declares every service it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'layout'])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers the four seats with their owner faces and unregisters on teardown', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    const header = b.ctx.slots.entries('conversation.session.header.utilities')
    const sidebar = b.ctx.slots.entries('sidebar.footer.action')
    const details = b.ctx.slots.entries('conversation.details.view')
    const overlay = b.ctx.slots.entries('shell.overlay')
    expect(header).toHaveLength(1)
    expect(sidebar).toHaveLength(1)
    expect(details).toHaveLength(1)
    expect(overlay).toHaveLength(1)

    expect(header[0]!.component).toBe(SquadHeaderChip)
    expect(sidebar[0]!.component).toBe(SquadSidebarStatus)
    expect(details[0]!.component).toBe(SquadDetailsView)
    expect(overlay[0]!.component).toBe(SquadAchievementToast)

    // The details seat is keyed under `squad`; the list seats carry stable ids.
    expect(details[0]!.options.key).toBe('squad')
    expect(header[0]!.options.id).toBe('squad')
    expect(sidebar[0]!.options.id).toBe('squad')
    expect(overlay[0]!.options.id).toBe('squad-achievement')

    // The injected face opens the `squad` surface through the layout service.
    const headerFace = (header[0]!.inject as unknown as () => InjectFace)()
    const sidebarFace = (sidebar[0]!.inject as unknown as () => InjectFace)()
    headerFace.openSquadDetails()
    sidebarFace.openSquadDetails()
    expect(b.openDetails).toHaveBeenCalledTimes(2)
    expect(b.openDetails).toHaveBeenLastCalledWith('squad')

    await fiber.dispose()
    expect(b.ctx.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
    expect(b.ctx.slots.entries('sidebar.footer.action')).toHaveLength(0)
    expect(b.ctx.slots.entries('conversation.details.view')).toHaveLength(0)
    expect(b.ctx.slots.entries('shell.overlay')).toHaveLength(0)
  })
})

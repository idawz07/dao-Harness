/**
 * Squad progress UI owner: the header and sidebar XP/level chips, the keyed
 * right-column progress surface, and the achievement toast. Reads only the
 * durable `squadProgress` projection and the session list — no invented data.
 *
 * @module @daoai/dao-client-ui-squad-progress/client
 */
import type { Context as ClientContext } from '@daoai/cordis'
import type {} from '@daoai/dao-client-locale/client'
import type {} from '@daoai/dao-client-ui-chat/client'
import type {} from '@daoai/dao-client-ui-conversation/client'
import type {} from '@daoai/dao-client-ui-layout/client'
import type {} from '@daoai/dao-client-ui-renderer/client'
import type {} from '@daoai/dao-client-ui-session/client'
import type {} from '@daoai/dao-client-ui-sidebar/client'
import type {} from '@daoai/dao-squad-progress/client'
import { SquadAchievementToast } from './SquadAchievementToast.tsx'
import { SquadDetailsView } from './SquadDetailsView.tsx'
import { SquadHeaderChip } from './SquadHeaderChip.tsx'
import { SquadSidebarStatus } from './SquadSidebarStatus.tsx'
import { en, NS, type SquadProgressKey } from './locales.ts'

declare module '@daoai/dao-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Squad progress chips, details surface, and achievement toast copy. */
    'squadProgress': SquadProgressKey
  }
}

/** Required services for slot registration and the details surface action. */
export const inject = ['slots', 'locale', 'layout']

/**
 * Client plugin body: register the squad progress seats.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-squad-progress: dictionaries')
  const openSquadDetails = (): void => {
    ctx.layout.openDetails('squad')
  }
  ctx.slots.inject(
    'conversation.session.header.utilities',
    () => ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'squad',
      order: 50,
      locale: NS,
      inject: () => ({ openSquadDetails }),
    }, SquadHeaderChip),
  )
  ctx.slots.inject(
    'sidebar.footer.action',
    () => ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'squad',
      order: 10,
      locale: NS,
      inject: () => ({ openSquadDetails }),
    }, SquadSidebarStatus),
  )
  ctx.slots.inject(
    'conversation.details.view',
    () => ctx.slots.register({
      name: 'conversation.details.view',
      key: 'squad',
      locale: NS,
    }, SquadDetailsView),
  )
  ctx.slots.inject(
    'shell.overlay',
    () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'squad-achievement',
      order: 0,
      locale: NS,
    }, SquadAchievementToast),
  )
}

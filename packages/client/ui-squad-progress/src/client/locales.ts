import type { SquadBadgeId } from '@daoai/dao-squad-progress/client'

/** `squadProgress` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'squadProgress'

/** English dictionary, English product copy. */
export const en = {
  'header.aria': 'Squad progress: level {level}, {xp} XP',
  'header.levelCompact': 'Lv.{level}',
  'header.open': 'Open squad progress',
  'sidebar.title': 'Squad',
  'sidebar.members.one': '{count} member',
  'sidebar.members.other': '{count} members',
  'sidebar.none': 'No members yet',
  'details.title': 'Squad progress',
  'details.close': 'Close squad progress',
  'details.empty': 'Squad progress appears as this session runs.',
  'rank.level': 'Level {level}',
  'rank.xp': '{xp} XP',
  'rank.next': '{xp} XP to level {level}',
  'rank.progress': 'Progress to level {level}',
  'roster.title': 'Members',
  'roster.empty': 'No members yet',
  'roster.loading': 'Loading members…',
  'roster.unavailable': 'Members are temporarily unavailable.',
  'roster.level': 'Level {level}',
  'roster.running': 'running',
  'roster.inactive': 'not running',
  'achievements.title': 'Achievements',
  'achievements.empty': 'No achievements yet',
  'badge.first_delegation': 'First delegation',
  'badge.ten_tools': 'Ten tools',
  'badge.error_free_turn': 'Error-free turn',
  'note.title': 'How XP is earned',
  'note.tool': 'Each successful tool result earns 1 XP.',
  'note.spawn': 'Each spawned member earns 2 XP.',
  'note.settled': 'Each finished member earns 5 XP.',
  'toast.earned': '{badge} earned',
} as const

/** Key domain of the `squadProgress` namespace (English key set). */
export type SquadProgressKey = keyof typeof en

/** Closed map from a badge id to its `badge.*` locale key. */
export const BADGE_KEYS: Record<SquadBadgeId, SquadProgressKey> = {
  'first_delegation': 'badge.first_delegation',
  'ten_tools': 'badge.ten_tools',
  'error_free_turn': 'badge.error_free_turn',
}

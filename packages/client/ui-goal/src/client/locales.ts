/** `goal` namespace dictionaries. */

/** English dictionary (the key-set source of truth). */
export const en = {
  'phase.active': 'Ongoing Goal',
  'phase.paused': 'Paused Goal',
  'phase.blocked': 'Blocked Goal',
  'phase.complete': 'Complete Goal',
  'mission.label': 'Current mission',
  'mission.rounds': '{rounds} of {max} rounds',
  'mission.progress': 'Mission progress',
  'mission.progressAria': 'Mission progress: {rounds} of {max} rounds',
  'objective.aria': 'Goal objective',
  'commandInput.aria': 'Command input',
  'action.save': 'Save goal',
  'action.cancel': 'Cancel edit',
  'action.pause': 'Pause goal',
  'action.resume': 'Resume goal',
  'action.edit': 'Edit goal',
  'action.clear': 'Clear goal',
} satisfies Record<string, string>

/** The goal namespace key union. */
export type GoalKey = keyof typeof en

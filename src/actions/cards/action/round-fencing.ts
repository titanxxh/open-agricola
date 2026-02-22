import type { ActionDefinition } from '../../../game/types'

export const fencing: ActionDefinition = {
  id: 'fencing',
  nameKey: 'actions.fencing.name',
  descriptionKey: 'actions.fencing.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => player.resources.wood > 0,
  execute: () => ({
    type: 'choice',
    promptKey: 'ui.interactionFenceSelect',
    options: [
      { value: 'confirm', labelKey: 'ui.interactionFenceConfirm' },
      { value: 'cancel', labelKey: 'ui.interactionFenceCancel' },
    ],
  }),
  resolveChoice: (_, choice) =>
    choice === 'cancel'
      ? { type: 'fail', logKey: 'log.fencingFail' }
      : { type: 'ok' },
}

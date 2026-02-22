import { getPlowableTiles } from '../../effects/plow'
import type { ActionDefinition } from '../../../game/types'

export const farmland: ActionDefinition = {
  id: 'farmland',
  nameKey: 'actions.farmland.name',
  descriptionKey: 'actions.farmland.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => getPlowableTiles(player).length > 0,
  execute: () => ({
    type: 'choice',
    promptKey: 'ui.interactionPlowSelect',
    options: [
      { value: 'confirm', labelKey: 'ui.interactionPlowConfirm' },
      { value: 'cancel', labelKey: 'ui.interactionPlowCancel' },
    ],
  }),
  resolveChoice: (_, choice) =>
    choice === 'cancel'
      ? { type: 'fail', logKey: 'log.plowFail' }
      : { type: 'ok', logKey: 'log.plow' },
}

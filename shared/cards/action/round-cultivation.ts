import { getPlowableTiles } from '../../actions/effects/plow'
import { canSow } from '../../actions/effects/sow'
import type { ActionDefinition } from '../../game/types'

export const cultivation: ActionDefinition = {
  id: 'cultivation',
  nameKey: 'actions.cultivation.name',
  descriptionKey: 'actions.cultivation.description',
  roundAvailable: 5,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) =>
    getPlowableTiles(player).length > 0 || canSow(player),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'or',
    promptKey: 'ui.interactionCultivationSelect',
    children: [
      { type: 'leaf', actionId: 'plow' },
      { type: 'leaf', actionId: 'sow' },
    ],
  },
}

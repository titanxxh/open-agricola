import { getPlowableTiles } from '../../actions/effects/plow'
import type { ActionDefinition } from '../../game/types'

export const farmland: ActionDefinition = {
  id: 'farmland',
  nameKey: 'actions.farmland.name',
  descriptionKey: 'actions.farmland.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => getPlowableTiles(player).length > 0,
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'plow' }],
  },
}

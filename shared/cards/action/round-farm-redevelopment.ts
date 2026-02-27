import { canPayResources } from '../../actions/effects/pay'
import { getRenovation } from '../../actions/effects/house'
import type { ActionDefinition } from '../../game/types'
import { wrapOptional } from '../../actions/flow'

export const farmRedevelopment: ActionDefinition = {
  id: 'farm-redevelopment',
  nameKey: 'actions.farm-redevelopment.name',
  descriptionKey: 'actions.farm-redevelopment.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => {
    const renovation = getRenovation(player)
    if (!renovation) return false
    return canPayResources(player, renovation.cost)
  },
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [
      { type: 'leaf', actionId: 'renovate-house' },
      wrapOptional({ type: 'leaf', actionId: 'fence' }),
    ],
  },
}

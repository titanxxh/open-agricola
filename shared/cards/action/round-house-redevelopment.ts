import { canPayResources } from '../../actions/effects/pay'
import { getRenovation } from '../../actions/effects/house'
import type { ActionDefinition } from '../../game/types'
import { wrapOptional } from '../../actions/flow'

export const houseRedevelopment: ActionDefinition = {
  id: 'house-redevelopment',
  nameKey: 'actions.house-redevelopment.name',
  descriptionKey: 'actions.house-redevelopment.description',
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
      wrapOptional({ type: 'leaf', actionId: 'improvement-any' }),
    ],
  },
}

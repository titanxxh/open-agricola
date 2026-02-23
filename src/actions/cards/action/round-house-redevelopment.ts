import { canPayResources } from '../../effects/pay'
import { getRenovation } from '../../effects/house'
import type { ActionDefinition } from '../../../game/types'
import { wrapOptional } from '../../flow'

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
      wrapOptional({ type: 'leaf', actionId: 'bake-bread-on-buy' }),
    ],
  },
}

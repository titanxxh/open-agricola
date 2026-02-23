import { canAfford, getBuildRoomCost } from '../../effects/house'
import { canPayResources } from '../../effects/pay'
import { stableWoodCost } from '../../effects/fencing'
import type { ActionDefinition } from '../../../game/types'

export const farmExpansion: ActionDefinition = {
  id: 'farm-expansion',
  nameKey: 'actions.farm-expansion.name',
  descriptionKey: 'actions.farm-expansion.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) =>
    canAfford(player, getBuildRoomCost(player.houseType)) ||
    canPayResources(player, { wood: stableWoodCost }),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'or',
    promptKey: 'ui.interactionFarmExpansionSelect',
    children: [
      { type: 'leaf', actionId: 'construct' },
      { type: 'leaf', actionId: 'stables' },
    ],
  },
}

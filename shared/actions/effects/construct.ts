import type { ActionDefinition, PlayerState, Resource } from '../../game/types'
import { canPayResources } from './pay'

export const getBuildRoomCost = (houseType: PlayerState['houseType']) => {
  if (houseType === 'clay') return { clay: 5, reed: 2 }
  if (houseType === 'stone') return { stone: 5, reed: 2 }
  return { wood: 5, reed: 2 }
}

export const canAfford = (player: PlayerState, cost: Partial<Resource>) =>
  canPayResources(player, cost)

export const constructAction: ActionDefinition = {
  id: 'construct',
  nameKey: 'actions.construct.name',
  descriptionKey: 'actions.construct.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) =>
    canAfford(player, getBuildRoomCost(player.houseType)),
  execute: () => ({
    type: 'choice',
    promptKey: 'ui.interactionRoomSelect',
    options: [
      { value: 'confirm', labelKey: 'ui.interactionRoomConfirm' },
      { value: 'cancel', labelKey: 'ui.interactionRoomCancel' },
    ],
  }),
  resolveChoice: () => ({ type: 'ok' }),
}

import type { ActionCostPreview, ActionDefinition, PlayerState, Resource } from '../../game/types'
import { canExecuteWithCostPreview } from './cost-preview'
import { canAffordCost } from './pay-helpers'

export const getBuildRoomCost = (houseType: PlayerState['houseType']) => {
  if (houseType === 'clay') return { clay: 5, reed: 2 }
  if (houseType === 'stone') return { stone: 5, reed: 2 }
  return { wood: 5, reed: 2 }
}

export const canAfford = (player: PlayerState, cost: Partial<Resource>) =>
  canAffordCost(player, cost)

export const constructCostPreview: ActionCostPreview = {
  getBaseCost: ({ player }) => getBuildRoomCost(player.houseType),
}

export const constructAction: ActionDefinition = {
  id: 'construct',
  nameKey: 'actions.construct.name',
  descriptionKey: 'actions.construct.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) =>
    canExecuteWithCostPreview(constructCostPreview, { state, player }),
  costPreview: constructCostPreview,
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

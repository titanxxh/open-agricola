import type { ActionCostPreview, ActionDefinition } from '../../game/types'
import { getBuildRoomCost, getMaxBuildableRooms } from '../helpers/room-payment'

const constructCostPreview: ActionCostPreview = {
  getBaseCost: ({ player }) => getBuildRoomCost(player.houseType),
  canExecute: (context, costOverride) =>
    getMaxBuildableRooms(context.player, costOverride) > 0,
}

export const constructAction: ActionDefinition = {
  id: 'construct',
  nameKey: 'actions.construct.name',
  descriptionKey: 'actions.construct.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => getMaxBuildableRooms(player) > 0,
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

import type { ActionDefinition, ActionExecutionResult, PlayerState } from '../../game/types'
import { getExtraRoomCapacity } from '../../cards/card-effects'

const effectiveRooms = (player: PlayerState) =>
  player.rooms + getExtraRoomCapacity(player)

export const growFamily = (player: PlayerState): ActionExecutionResult => {
  if (effectiveRooms(player) <= player.familySize) {
    return { type: 'fail', logKey: 'log.familyGrowthFail' }
  }
  player.familySize += 1
  player.newbornCount += 1
  return { type: 'ok', logKey: 'log.familyGrowth' }
}

export const growFamilyWithoutRoom = (
  player: PlayerState,
): ActionExecutionResult => {
  player.familySize += 1
  player.newbornCount += 1
  return { type: 'ok', logKey: 'log.familyGrowth' }
}

export const wishChildrenAction: ActionDefinition = {
  id: 'wish-children-growth',
  nameKey: 'actions.wish-children-growth.name',
  descriptionKey: 'actions.wish-children-growth.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => effectiveRooms(player) > player.familySize,
  execute: ({ player }) => growFamily(player),
}

export const growFamilyWithoutRoomAction: ActionDefinition = {
  id: 'grow-family-without-room',
  nameKey: 'actions.urgent-wish-children.name',
  descriptionKey: 'actions.urgent-wish-children.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => growFamilyWithoutRoom(player),
}

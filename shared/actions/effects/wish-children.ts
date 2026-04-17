import type { ActionDefinition, ActionExecutionResult, GameState, PlayerState } from '../../game/types'
import { getExtraRoomCapacity } from '../../cards/card-effects'
import { activateSmallestInactive, familySize } from '../../game/player'
import { addWorkerRef } from '../../game/space'

const effectiveRooms = (player: PlayerState) =>
  player.rooms + getExtraRoomCapacity(player)

export const growFamily = (
  state: GameState,
  player: PlayerState,
  fgSpaceId: string,
): ActionExecutionResult => {
  if (effectiveRooms(player) <= familySize(player)) {
    return { type: 'fail', logKey: 'log.familyGrowthFail' }
  }
  const newborn = activateSmallestInactive(player)
  if (!newborn) return { type: 'fail', logKey: 'log.familyFull' }

  const fgSpace = state.actionSpaces.find(s => s.id === fgSpaceId)
  if (fgSpace) {
    // Push newborn WorkerRef onto the FG space.
    // Deliberately NOT calling recordRoundPlacement — newborns don't count as placements.
    addWorkerRef(fgSpace, player.id, newborn.id)
  }

  return { type: 'ok', logKey: 'log.familyGrowth' }
}

export const growFamilyWithoutRoom = (
  state: GameState,
  player: PlayerState,
  fgSpaceId: string,
): ActionExecutionResult => {
  const newborn = activateSmallestInactive(player)
  if (!newborn) return { type: 'fail', logKey: 'log.familyFull' }

  const fgSpace = state.actionSpaces.find(s => s.id === fgSpaceId)
  if (fgSpace) {
    // Push newborn WorkerRef onto the FG space.
    // Deliberately NOT calling recordRoundPlacement — newborns don't count as placements.
    addWorkerRef(fgSpace, player.id, newborn.id)
  }

  return { type: 'ok', logKey: 'log.familyGrowth' }
}

export const wishChildrenAction: ActionDefinition = {
  id: 'wish-children-growth',
  nameKey: 'actions.wish-children-growth.name',
  descriptionKey: 'actions.wish-children-growth.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => effectiveRooms(player) > familySize(player),
  execute: ({ state, player, space }) => growFamily(state, player, space.id),
}

export const growFamilyWithoutRoomAction: ActionDefinition = {
  id: 'grow-family-without-room',
  nameKey: 'actions.urgent-wish-children.name',
  descriptionKey: 'actions.urgent-wish-children.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, space }) => growFamilyWithoutRoom(state, player, space.id),
}

import type {
  ActionDefinition,
  ActionExecutionResult,
  GameState,
  PlayerState,
} from '../../game/types'
import { getExtraRoomCapacity } from '../../cards/card-effects'
import { activateSmallestInactive, familySize } from '../../game/player'
import { addWorkerRef } from '../../game/space'

const effectiveRooms = (player: PlayerState) =>
  player.rooms + getExtraRoomCapacity(player)

const growFamilyCore = (
  state: GameState,
  player: PlayerState,
  fgSpaceId: string,
): ActionExecutionResult => {
  const newborn = activateSmallestInactive(player)
  if (!newborn) return { type: 'fail', logKey: 'log.familyFull' }
  const fgSpace = state.actionSpaces.find((s) => s.id === fgSpaceId)
  if (fgSpace) {
    // Push newborn WorkerRef onto the FG space.
    // Deliberately NOT calling recordRoundPlacement — newborns don't count as placements.
    addWorkerRef(fgSpace, player.id, newborn.id)
  }
  return { type: 'ok', logKey: 'log.familyGrowth' }
}

/**
 * Sprint 6a: unified `family-growth` action. Replaces both
 * `wish-children-growth` (room-required) and `grow-family-without-room`.
 * Pass `actionContext.skipRoomCheck: true` from the calling flow / space to
 * bypass the free-room precondition (urgent wish-children, E22, etc.).
 */
export const familyGrowthAction: ActionDefinition = {
  id: 'family-growth',
  nameKey: 'actions.family-growth.name',
  descriptionKey: 'actions.family-growth.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => {
    // Doable check at action-registry level cannot inspect actionContext, so
    // err on the side of true; engine's per-flow availability check (which
    // runs with full actionContext) is the authoritative gate.
    return true
  },
  execute: ({ state, player, space, actionContext }) => {
    const skipRoom =
      (actionContext as { skipRoomCheck?: boolean } | undefined)?.skipRoomCheck === true
    if (!skipRoom && effectiveRooms(player) <= familySize(player)) {
      return { type: 'fail', logKey: 'log.familyGrowthFail' }
    }
    return growFamilyCore(state, player, space.id)
  },
}

// Back-compat exports for any existing helper consumers.
export const growFamily = growFamilyCore
export const growFamilyWithoutRoom = growFamilyCore

// Legacy aliases — deprecated. Same definition object exposed under prior
// `id` strings so any cached references keep working until the next sweep.
export const wishChildrenAction: ActionDefinition = {
  ...familyGrowthAction,
  id: 'wish-children-growth',
}
export const growFamilyWithoutRoomAction: ActionDefinition = {
  ...familyGrowthAction,
  id: 'grow-family-without-room',
  // Always allow (the historical urgent-wish-children semantic).
  execute: ({ state, player, space }) => growFamilyCore(state, player, space.id),
}

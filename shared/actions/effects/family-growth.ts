import type {
  ActionDefinition,
  ActionExecutionResult,
  GameState,
  PlayerState,
} from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { getExtraRoomCapacity } from '../../cards/card-effects'
import { activateSmallestInactive, familySize, hasInactiveWorkerInSupply } from '../../domain/player'
import { addWorkerRef } from '../../domain/space'

const effectiveRooms = (player: PlayerState) =>
  player.rooms + getExtraRoomCapacity(player)

const growFamilyCore = (
  state: GameState,
  player: PlayerState,
  fgSpaceId: string,
  eventSink?: EventSink,
): ActionExecutionResult => {
  const newborn = activateSmallestInactive(player)
  if (!newborn) return { type: 'fail', errorKey: 'log.familyFull' }
  const fgSpace = state.actionSpaces.find((s) => s.id === fgSpaceId)
  if (fgSpace) {
    // Push newborn WorkerRef onto the FG space.
    // Deliberately NOT calling recordRoundPlacement — newborns don't count as placements.
    addWorkerRef(fgSpace, player.id, newborn.id)
  }
  eventSink?.emit<'worker.placed'>({
    type: 'worker.placed',
    workerId: newborn.id,
    spaceId: fgSpaceId,
  })
  return { type: 'ok' }
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
  canBeExecutedByPlayer: (_state, player, context) => {
    if (!hasInactiveWorkerInSupply(player)) return false
    const skipRoom =
      (context?.actionContext as { skipRoomCheck?: boolean } | undefined)?.skipRoomCheck === true
    return skipRoom || effectiveRooms(player) > familySize(player)
  },
  execute: ({ state, player, space, actionContext, eventSink }) => {
    const skipRoom =
      (actionContext as { skipRoomCheck?: boolean } | undefined)?.skipRoomCheck === true
    if (!skipRoom && effectiveRooms(player) <= familySize(player)) {
      return { type: 'fail', errorKey: 'log.familyGrowthFail' }
    }
    return growFamilyCore(state, player, space.id, eventSink)
  },
}

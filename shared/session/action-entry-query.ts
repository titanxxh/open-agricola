import type { ActionSpace, GameState, PlayerState } from '../contract/types'
import { canEnterSpace, canUseExclusiveSpace, computeAllowedPlacementSpaces } from '../actions/helpers/placement-availability'
import { addLinkedSpaceBlocks, addWorkerRef, isSpaceBlocked, isSpaceOccupied } from '../domain/space'
import { recordActionSnapshot, writeActionSnapshotExtraData } from '../cards/helpers/action-snapshot'
import { recordRoundPlacement } from '../cards/helpers/round-placement'
import { incPlacedFarmers } from './stats'
import { appendImmediateEvents } from '../events/append'
import { canMoorWorkerEnterSpace } from '../moor/heating'
import { isThroughTheSeasonsSeason } from '../seasons/rules'

type ActionEntryQueryOptions = {
  vetoesAction?: (space: ActionSpace) => boolean
  isActionDoable?: (space: ActionSpace, baseDoable: () => boolean) => boolean
}

type ActionEntryAvailabilityOptions = {
  isActionDoable: (space: ActionSpace, baseDoable: () => boolean) => boolean
}

export const applyActionPlacement = (
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
  workerId: string,
  actionToken: number,
): void => {
  player._activeActionBonusSources = []
  recordActionSnapshot(player, actionToken)
  writeActionSnapshotExtraData(player, 'placedWorkerId', workerId)
  addWorkerRef(space, player.id, workerId)
  addLinkedSpaceBlocks(state, space, player.id, workerId)
  appendImmediateEvents(state, [{ type: 'worker.placed', workerId, spaceId: space.id }], {
    actorPlayerId: player.id,
    sourceActionId: space.id,
  })
  recordRoundPlacement(player, space.id, workerId)
  incPlacedFarmers(player)
}

export const canEnterActionSpace = (
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
  options: ActionEntryQueryOptions = {},
): boolean => {
  if (isSpaceBlocked(space)) return false
  if (!canUseExclusiveSpace(space, player, state)) return false
  if (space.strictCanExecute || options.isActionDoable) {
    const baseDoable = () => space.canBeExecutedByPlayer(state, player)
    if (!(options.isActionDoable?.(space, baseDoable) ?? baseDoable())) return false
  }
  if (
    space.id === 'fencing' &&
    isThroughTheSeasonsSeason(state, 'spring') &&
    !space.canBeExecutedByPlayer(state, player)
  ) {
    return false
  }
  if (isSpaceOccupied(space)) {
    const allowed = computeAllowedPlacementSpaces(state, player)
    if (!allowed.some((entry) => entry.spaceId === space.id)) return false
  }
  if (options.isActionDoable) return true
  return options.vetoesAction?.(space) !== true
}

export const canProjectActionEntry = (
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
  options: ActionEntryAvailabilityOptions,
): boolean => {
  if (!canEnterSpace(space, player, state)) return false
  if (!canMoorWorkerEnterSpace(state, player, space.id)) return false
  if (isSpaceBlocked(space)) return false
  if (isSpaceOccupied(space)) {
    const allowed = computeAllowedPlacementSpaces(state, player)
    if (!allowed.some((entry) => entry.spaceId === space.id)) return false
  }
  return options.isActionDoable(space, () => space.canBeExecutedByPlayer(state, player))
}

export const computeActionEntryAvailability = (
  state: GameState,
  player: PlayerState,
  options: ActionEntryAvailabilityOptions,
): Record<string, boolean> => {
  const allowedPlacementSpaceIds = new Set(
    computeAllowedPlacementSpaces(state, player, {
      isActionDoable: options.isActionDoable,
    }).map((entry) => entry.spaceId),
  )
  return Object.fromEntries(
    state.actionSpaces.map((space) => [
      space.id,
      allowedPlacementSpaceIds.has(space.id),
    ]),
  )
}

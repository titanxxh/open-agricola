import type { ActionSpace, GameState, PlayerState } from '../contract/types'
import { canEnterSpace, canUseExclusiveSpace, computeAllowedPlacementSpaces } from '../actions/helpers/placement-availability'
import { isSpaceBlocked, isSpaceOccupied } from '../domain/space'
import { canMoorWorkerEnterSpace } from '../moor/heating'
import { isThroughTheSeasonsSeason } from '../seasons/rules'

type ActionEntryQueryOptions = {
  vetoesAction?: (space: ActionSpace) => boolean
}

type ActionEntryAvailabilityOptions = {
  isActionDoable: (space: ActionSpace, baseDoable: boolean) => boolean
}

export const canEnterActionSpace = (
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
  options: ActionEntryQueryOptions = {},
): boolean => {
  if (isSpaceBlocked(space)) return false
  if (!canUseExclusiveSpace(space, player, state)) return false
  if (space.strictCanExecute && !space.canBeExecutedByPlayer(state, player)) return false
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
  return options.isActionDoable(space, space.canBeExecutedByPlayer(state, player))
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

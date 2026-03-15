import type { ActionDefinition, ActionExecutionResult, ActionSpace, PlayerState } from '../../game/types'
import { recordRoundPlacement } from '../../cards/helpers/round-placement'

export const OCCUPIED_SPACE_CHOICE_PREFIX = 'allow-occupied:'

export const placeFarmer = (
  player: PlayerState,
  space: ActionSpace,
): ActionExecutionResult => {
  if (space.takenBy) {
    return { type: 'ok' }
  }
  space.takenBy = player.id
  player.workersAvailable = Math.max(0, player.workersAvailable - 1)
  recordRoundPlacement(player, space.id)
  return { type: 'ok' }
}

export const placeFarmerAction: ActionDefinition = {
  id: 'place-farmer',
  nameKey: 'actions.place-farmer.name',
  descriptionKey: 'actions.place-farmer.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => player.workersAvailable > 0,
  execute: ({ state, player }) => {
    const available = state.actionSpaces
      .filter((s) => !s.takenBy && s.canBeExecutedByPlayer(state, player))
      .map((s) => ({ value: s.id, labelKey: s.nameKey }))
    if (available.length === 0) return { type: 'fail', logKey: 'log.placeFarmerFail' }
    return {
      type: 'choice',
      promptKey: 'ui.interactionPlaceFarmerExtra',
      options: available,
    }
  },
  resolveChoice: ({ state, player }, choice) => {
    const allowOccupied = choice.startsWith(OCCUPIED_SPACE_CHOICE_PREFIX)
    const targetSpaceId = allowOccupied
      ? choice.slice(OCCUPIED_SPACE_CHOICE_PREFIX.length)
      : choice
    const targetSpace = state.actionSpaces.find((s) => s.id === targetSpaceId)
    if (!targetSpace) return { type: 'fail', logKey: 'log.placeFarmerFail' }
    if (targetSpace.takenBy && !allowOccupied) {
      return { type: 'fail', logKey: 'log.placeFarmerFail' }
    }
    if (!targetSpace.takenBy) {
      targetSpace.takenBy = player.id
    }
    player.workersAvailable -= 1
    recordRoundPlacement(player, targetSpace.id)
    const result = targetSpace.execute({ state, player, space: targetSpace })
    if (result.type === 'flow') return result
    return result
  },
}

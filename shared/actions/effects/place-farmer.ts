import type { ActionDefinition, ActionExecutionResult, ActionSpace, PlayerState } from '../../game/types'

export const placeFarmer = (
  player: PlayerState,
  space: ActionSpace,
): ActionExecutionResult => {
  if (space.takenBy) {
    return { type: 'ok' }
  }
  space.takenBy = player.id
  player.workersAvailable = Math.max(0, player.workersAvailable - 1)
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
    const targetSpace = state.actionSpaces.find((s) => s.id === choice)
    if (!targetSpace || targetSpace.takenBy) return { type: 'fail', logKey: 'log.placeFarmerFail' }
    targetSpace.takenBy = player.id
    player.workersAvailable -= 1
    const result = targetSpace.execute({ state, player, space: targetSpace })
    if (result.type === 'flow') return result
    return result
  },
}

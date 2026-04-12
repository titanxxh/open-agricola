import type { ActionDefinition } from '../../game/types'

/**
 * Move a farmer from a source action space to an unoccupied action space and execute it.
 * Used by D51_Archway (move from Archway) and E10_StrawHat (move from Farmland).
 *
 * - execute(): lists available unoccupied spaces (excluding params.excludeSpaceId) → returns choice
 * - resolveChoice(): marks target space as takenBy, executes the space's action
 *
 * Special case: A28_ForestSchool allows moving to occupied Lessons spaces.
 */
export const moveFarmerToSpaceAction: ActionDefinition = {
  id: 'move-farmer-to-space',
  nameKey: 'actions.move-farmer-to-space.name',
  descriptionKey: 'actions.move-farmer-to-space.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params }) => {
    const excludeId = params?.excludeSpaceId as string | undefined
    const spaces = state.actionSpaces.filter(
      (s) => !s.takenBy && s.id !== excludeId && s.canBeExecutedByPlayer(state, player),
    )
    // A28_ForestSchool: allow occupied Lessons spaces
    if (player.occupationPlayed.includes('A28_ForestSchool')) {
      for (const s of state.actionSpaces) {
        if (s.takenBy && s.id.startsWith('lessons') && !spaces.includes(s)) {
          if (s.canBeExecutedByPlayer(state, player)) {
            spaces.push(s)
          }
        }
      }
    }
    if (spaces.length === 0) return { type: 'fail', logKey: 'log.actionFail' }
    return {
      type: 'choice',
      promptKey: 'ui.interactionMoveFarmerToSpace',
      options: spaces.map((s) => ({ value: s.id, labelKey: s.nameKey })),
    }
  },
  resolveChoice: ({ state, player }, choice) => {
    const targetSpace = state.actionSpaces.find((s) => s.id === choice)
    if (!targetSpace) return { type: 'fail', logKey: 'log.actionFail' }
    // Move farmer to target space (mark as taken, but don't decrement workersAvailable)
    if (!targetSpace.takenBy) {
      targetSpace.takenBy = player.id
    }
    // Execute the target space's action
    return targetSpace.execute({ state, player, space: targetSpace })
  },
}

import type { ActionDefinition } from '../../game/types'

/**
 * Move a farmer from D51_Archway to an unoccupied action space and execute it.
 * BGA-aligned: no workersAvailable manipulation — the farmer is physically moved.
 *
 * - execute(): lists available unoccupied spaces (excluding D51 itself) → returns choice
 * - resolveChoice(): marks target space as takenBy, executes the space's action
 *
 * Special case: A28_ForestSchool allows moving to occupied Lessons spaces.
 */
export const archwayMoveFarmerAction: ActionDefinition = {
  id: 'archway-move-farmer',
  nameKey: 'actions.archway-move-farmer.name',
  descriptionKey: 'actions.archway-move-farmer.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player }) => {
    const spaces = state.actionSpaces.filter(
      (s) => !s.takenBy && s.id !== 'D51_Archway' && s.canBeExecutedByPlayer(state, player),
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
      promptKey: 'ui.interactionArchwayMoveFarmer',
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

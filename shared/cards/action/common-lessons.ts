import type { ActionDefinition } from '../../contract/types'
import { hasPlayableOccupationChoice } from '../../actions/effects/occupation'

export const lessons: ActionDefinition = {
  id: 'lessons',
  nameKey: 'actions.lessons.name',
  descriptionKey: 'actions.lessons.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [2, 3, 4, 5, 6],
  canBeExecutedByPlayer: (state, player, context) =>
    hasPlayableOccupationChoice(state, player, 'lessons', undefined, context?.actionHooks),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'occupation' }],
  },
}

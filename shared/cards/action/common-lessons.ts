import type { ActionDefinition } from '../../contract/types'
import { hasPlayableOccupationChoice } from '../../actions/effects/occupation'

export const lessons: ActionDefinition = {
  id: 'lessons',
  nameKey: 'actions.lessons.name',
  descriptionKey: 'actions.lessons.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [2, 3, 4, 5, 6],
  canBeExecutedByPlayer: (state, player) =>
    hasPlayableOccupationChoice(state, player, 'lessons'),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'occupation' }],
  },
}

import type { ActionDefinition } from '../../contract/types'
import { hasPlayableOccupationChoice } from '../../actions/effects/occupation'

export const lessons4: ActionDefinition = {
  id: 'lessons-4',
  nameKey: 'actions.lessons-4.name',
  descriptionKey: 'actions.lessons-4.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [4],
  canBeExecutedByPlayer: (state, player) =>
    hasPlayableOccupationChoice(state, player, 'lessons-4'),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'occupation' }],
  },
}

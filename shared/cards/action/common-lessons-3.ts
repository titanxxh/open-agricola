import type { ActionDefinition } from '../../contract/types'
import { hasPlayableOccupationChoice } from '../../actions/effects/occupation'

export const lessons3: ActionDefinition = {
  id: 'lessons-3',
  nameKey: 'actions.lessons-3.name',
  descriptionKey: 'actions.lessons-3.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [3],
  canBeExecutedByPlayer: (state, player, context) =>
    hasPlayableOccupationChoice(state, player, 'lessons-3', undefined, context?.actionHooks),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'occupation' }],
  },
}

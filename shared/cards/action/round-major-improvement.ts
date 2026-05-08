import { deriveCanBeExecutedByFlow } from '../../actions/flow'
import type { ActionDefinition } from '../../contract/types'

export const majorImprovement: ActionDefinition = {
  id: 'major-improvement',
  nameKey: 'actions.major-improvement.name',
  descriptionKey: 'actions.major-improvement.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'improvement-any' }],
  },
}

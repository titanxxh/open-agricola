import { deriveCanBeExecutedByFlow } from '../../actions/flow'
import type { ActionDefinition } from '../../contract/types'

export const majorImprovement: ActionDefinition = {
  id: 'major-improvement',
  nameKey: 'actions.improvement.name',
  descriptionKey: 'actions.improvement.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'improvement', params: { types: ['major', 'minor'] } }],
  },
}

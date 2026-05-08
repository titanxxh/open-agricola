import { deriveCanBeExecutedByFlow } from '../../actions/flow'
import type { ActionDefinition } from '../../contract/types'

export const grainUtilization: ActionDefinition = {
  id: 'grain-utilization',
  nameKey: 'actions.grain-utilization.name',
  descriptionKey: 'actions.grain-utilization.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'or',
    promptKey: 'ui.interactionGrainUtilizationChoice',
    children: [
      { type: 'leaf', actionId: 'sow' },
      { type: 'leaf', actionId: 'bake-bread' },
    ],
  },
}

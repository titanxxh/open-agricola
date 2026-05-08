import { deriveCanBeExecutedByFlow } from '../../actions/flow'
import type { ActionDefinition } from '../../contract/types'

export const cultivation: ActionDefinition = {
  id: 'cultivation',
  nameKey: 'actions.cultivation.name',
  descriptionKey: 'actions.cultivation.description',
  roundAvailable: 5,
  gainPerRound: {},
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'or',
    promptKey: 'ui.interactionCultivationSelect',
    children: [
      { type: 'leaf', actionId: 'plow' },
      { type: 'leaf', actionId: 'sow' },
    ],
  },
}

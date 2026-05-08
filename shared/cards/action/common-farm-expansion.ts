import { deriveCanBeExecutedByFlow } from '../../actions/flow'
import type { ActionDefinition } from '../../contract/types'

export const farmExpansion: ActionDefinition = {
  id: 'farm-expansion',
  nameKey: 'actions.farm-expansion.name',
  descriptionKey: 'actions.farm-expansion.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [2, 3, 4],
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'or',
    promptKey: 'ui.interactionFarmExpansionSelect',
    children: [
      { type: 'leaf', actionId: 'construct' },
      { type: 'leaf', actionId: 'stables' },
    ],
  },
}

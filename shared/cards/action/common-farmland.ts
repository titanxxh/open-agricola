import { deriveCanBeExecutedByFlow } from '../../actions/flow'
import type { ActionDefinition } from '../../contract/types'

export const farmland: ActionDefinition = {
  id: 'farmland',
  nameKey: 'actions.farmland.name',
  descriptionKey: 'actions.farmland.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [2, 3, 4, 5, 6],
  strictCanExecute: true,
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'plow' }],
  },
}

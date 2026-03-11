import { deriveCanBeExecutedByFlow } from '../../actions/flow'
import type { ActionDefinition } from '../../game/types'

export const farmland: ActionDefinition = {
  id: 'farmland',
  nameKey: 'actions.farmland.name',
  descriptionKey: 'actions.farmland.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'plow' }],
  },
}

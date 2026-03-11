import { deriveCanBeExecutedByFlow } from '../../actions/flow'
import type { ActionDefinition } from '../../game/types'

export const fencing: ActionDefinition = {
  id: 'fencing',
  nameKey: 'actions.fencing.name',
  descriptionKey: 'actions.fencing.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'fence' }],
  },
}

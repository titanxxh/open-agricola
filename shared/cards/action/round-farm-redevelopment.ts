import type { ActionDefinition } from '../../contract/types'
import { deriveCanBeExecutedByFlow, wrapOptional } from '../../actions/flow'

export const farmRedevelopment: ActionDefinition = {
  id: 'farm-redevelopment',
  nameKey: 'actions.farm-redevelopment.name',
  descriptionKey: 'actions.farm-redevelopment.description',
  roundAvailable: 1,
  gainPerRound: {},
  strictCanExecute: true,
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [
      { type: 'leaf', actionId: 'renovate-house' },
      wrapOptional({ type: 'leaf', actionId: 'fence' }),
    ],
  },
}

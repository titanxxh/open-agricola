import type { ActionDefinition } from '../../contract/types'
import { deriveCanBeExecutedByFlow, wrapOptional } from '../../actions/flow'

export const houseRedevelopment: ActionDefinition = {
  id: 'house-redevelopment',
  nameKey: 'actions.house-redevelopment.name',
  descriptionKey: 'actions.house-redevelopment.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [
      { type: 'leaf', actionId: 'renovate-house' },
      wrapOptional({ type: 'leaf', actionId: 'improvement-any' }),
    ],
  },
}

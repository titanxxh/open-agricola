import type { ActionDefinition } from '../../contract/types'
import { deriveCanBeExecutedByFlow, wrapOptional } from '../../actions/flow'

export const wishChildren: ActionDefinition = {
  id: 'wish-children',
  nameKey: 'actions.wish-children.name',
  descriptionKey: 'actions.wish-children.description',
  roundAvailable: 2,
  gainPerRound: {},
  strictCanExecute: true,
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [
      { type: 'leaf', actionId: 'family-growth' },
      wrapOptional({ type: 'leaf', actionId: 'improvement', actionContext: { types: ['minor'] } }),
    ],
  },
}

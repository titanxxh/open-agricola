import type { ActionDefinition } from '../../game/types'
import { deriveCanBeExecutedByFlow, wrapOptional } from '../../actions/flow'

export const wishChildren: ActionDefinition = {
  id: 'wish-children',
  nameKey: 'actions.wish-children.name',
  descriptionKey: 'actions.wish-children.description',
  roundAvailable: 2,
  gainPerRound: {},
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [
      { type: 'leaf', actionId: 'wish-children-growth' },
      wrapOptional({ type: 'leaf', actionId: 'minor-improvement' }),
    ],
  },
}

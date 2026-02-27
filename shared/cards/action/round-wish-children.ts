import type { ActionDefinition } from '../../../game/types'
import { wrapOptional } from '../../actions/flow'

export const wishChildren: ActionDefinition = {
  id: 'wish-children',
  nameKey: 'actions.wish-children.name',
  descriptionKey: 'actions.wish-children.description',
  roundAvailable: 2,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => player.rooms > player.familySize,
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [
      { type: 'leaf', actionId: 'wish-children-growth' },
      wrapOptional({ type: 'leaf', actionId: 'minor-improvement' }),
    ],
  },
}

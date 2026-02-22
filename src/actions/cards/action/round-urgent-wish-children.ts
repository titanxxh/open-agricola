import type { ActionDefinition } from '../../../game/types'

export const urgentWishChildren: ActionDefinition = {
  id: 'urgent-wish-children',
  nameKey: 'actions.urgent-wish-children.name',
  descriptionKey: 'actions.urgent-wish-children.description',
  roundAvailable: 5,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'grow-family-without-room' }],
  },
}

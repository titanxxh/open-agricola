import type { ActionDefinition } from '../../game/types'
import { deriveCanBeExecutedByFlow } from '../../actions/flow'

export const urgentWishChildren: ActionDefinition = {
  id: 'urgent-wish-children',
  nameKey: 'actions.urgent-wish-children.name',
  descriptionKey: 'actions.urgent-wish-children.description',
  roundAvailable: 5,
  gainPerRound: {},
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'family-growth', actionContext: { skipRoomCheck: true } }],
  },
}

import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'
import { E49_Twibil } from '../../cards-display/E/E49_Twibil'

const CARD_ID = E49_Twibil.id

/**
 * E49 Twibil (MinorImprovement, E, 49)
 * Each time any player builds at least 1 wood room,
 * card owner gets 1 food.
 *
 * BGA: onPlayerAfterBuildRoom — checks if at least 1 wood room was built.
 *
 * scope 'any' — fires when any player (including owner) builds wood rooms.
 * Cost: 1 stone.
 */

const listener: CardListenerRegistration = {
  id: 'E49-twibil-any-construct-wood-room',
  cardIds: [CARD_ID],
  actions: ['construct'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const builder = context.triggerPlayer ?? context.player
    const roomsBuilt = getRoomsBuiltThisAction(builder)
    if (roomsBuilt <= 0) return
    if (builder.houseType !== 'wood') return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

export const E49_Twibil_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

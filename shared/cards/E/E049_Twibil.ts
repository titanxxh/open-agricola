import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'

const CARD_ID = 'E049_Twibil'
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E049_Twibil = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Twibil',
    deck: 'E',
    number: 49,
    category: 'FOOD',
    desc: [
        'Each time after any player (including you) builds at least 1 wood room, you get 1 <FOOD>.',
      ],
    cost: { stone: 1 },
    vp: 1,
  },
  impl: cardImpl,
})

export const E049_Twibil_impl = E049_Twibil.impl

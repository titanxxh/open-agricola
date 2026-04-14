import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'

const CARD_ID = 'E151_DeliveryNurse'

/**
 * E151 Delivery Nurse — Once this game, if you have all types of animals,
 * you can use any __Wish for Children__ action space even without room.
 *
 * BGA: onPlayerComputePlaceFarmerFlow — if WishChildren action, player has all
 * 3 animal types, and card not flagged: change wish-children-growth to
 * grow-family-without-room (and flag the card after).
 *
 * Implementation: computeReplace listener on wish-children-growth to swap
 * with grow-family-without-room, followed by flagging the card.
 * Players: 4+.
 */
const computeReplaceListener: CardListenerRegistration = {
  id: 'E151-delivery-nurse-replace-wish-children',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['wish-children-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (isCardFlagged(context.player, CARD_ID)) return
    const { sheep, boar, cattle } = context.player.resources
    if (!((sheep ?? 0) > 0 && (boar ?? 0) > 0 && (cattle ?? 0) > 0)) return
    // Only activate if player has no room for a child (wish-children-growth would fail)
    if (context.player.rooms > context.player.familySize) return
    return {
      actionId: 'grow-family-without-room',
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'grow-family-without-room', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(computeReplaceListener)

export const E151_DeliveryNurse = new Occupation({
  id: CARD_ID,
  name: 'Delivery Nurse',
  deck: 'E',
  number: 151,
  desc: ['Once this game, if you have all types of animals, you can use any __Wish for Children__ action space even without room.'],
  cost: {},
  players: '4+',
})

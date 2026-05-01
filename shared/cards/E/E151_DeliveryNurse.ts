import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { familySize } from '../../game/player'
import type { CardImpl } from '../registry'

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
  actions: ['family-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    const { sheep, boar, cattle } = context.player.resources
    if (!((sheep ?? 0) > 0 && (boar ?? 0) > 0 && (cattle ?? 0) > 0)) return
    // Only activate if player has no room for a child (family-growth would fail)
    if (context.player.rooms > familySize(context.player)) return
    return {
      actionId: 'family-growth',
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'family-growth',
            sourceCard: CARD_ID,
            actionContext: { skipRoomCheck: true },
          },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E151_DeliveryNurse = new Occupation({
  id: CARD_ID,
  name: 'Delivery Nurse',
  deck: 'E',
  number: 151,
  desc: ['Once this game, if you have all types of animals, you can use any __Wish for Children__ action space even without room.'],
  cost: {},
  players: '4+',
})

export const E151_DeliveryNurse_impl = {
  listeners: [computeReplaceListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

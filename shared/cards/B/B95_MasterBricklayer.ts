import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isMajorCardId } from '../helpers/card-type'
import type { CardImpl } from '../registry'
import { B95_MasterBricklayer } from '../../cards-display/B/B95_MasterBricklayer'
export { B95_MasterBricklayer }

const CARD_ID = B95_MasterBricklayer.id

/**
 * B95 Master Bricklayer — Each time you build a major improvement, reduce the stone cost
 * by the number of rooms you have built onto your initial house.
 * BGA: onPlayerComputeCardCosts, applies to MAJOR type only.
 * Discount = (current rooms - 2) stone.
 */
const computeCostsListener: CardListenerRegistration = {
  id: 'B95-master-bricklayer-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Only applies to major improvements
    const cardId = context.cardId
    if (!cardId || !isMajorCardId(cardId)) return
    const nbNewRooms = (context.player.rooms ?? 2) - 2
    if (nbNewRooms <= 0) return
    return { costs: { stone: -nbNewRooms } }
  },
}

export const B95_MasterBricklayer_impl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

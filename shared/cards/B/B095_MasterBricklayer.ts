import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase } from '../../actions/hooks'
import { isMajorCardId } from '../helpers/card-type'
import type { CardImpl } from '../registry'
import { PaymentSolver } from '../../actions/payment'

const CARD_ID = 'B095_MasterBricklayer'
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
  actions: ['improvement'],
  deriveCardCostCandidate: (context, candidate) => {
    if (!context.cardId || !isMajorCardId(context.cardId)) return null
    const nbNewRooms = (context.player.rooms ?? 2) - 2
    if (nbNewRooms <= 0) return null
    return PaymentSolver.discountCardCostCandidate(candidate, CARD_ID, { stone: nbNewRooms })
  },
}

const cardImpl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B095_MasterBricklayer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Master Bricklayer',
    deck: 'B',
    number: 95,
    category: 'ACTIONS_BOOSTER',
    desc: ['Each time you build a major improvement, reduce the <STONE> cost by the number of rooms you have built onto your initial house.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B095_MasterBricklayer_impl = B095_MasterBricklayer.impl

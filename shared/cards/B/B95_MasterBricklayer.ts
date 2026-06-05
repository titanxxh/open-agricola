import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isMajorCardId } from '../helpers/card-type'
import type { CardImpl } from '../registry'

const CARD_ID = 'B95_MasterBricklayer'
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
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const cardId = context.cardId
    if (!cardId || !isMajorCardId(cardId)) return
    const nbNewRooms = (context.player.rooms ?? 2) - 2
    if (nbNewRooms <= 0) return
    return {
      candidateDerivers: [{
        id: `${CARD_ID}:master-bricklayer-stone-discount`,
        sourceCardId: CARD_ID,
        derive(candidate) {
          const stone = candidate.cost.stone ?? 0
          if (stone <= 0) return []
          return [{ cost: { ...candidate.cost, stone: Math.max(0, stone - nbNewRooms) } }]
        },
      }],
    }
  },
}

const cardImpl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B95_MasterBricklayer = defineOccupationCard({
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

export const B95_MasterBricklayer_impl = B95_MasterBricklayer.impl

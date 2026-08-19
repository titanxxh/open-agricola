import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { findTravelingPlayersSpace, TRAVELING_PLAYERS_SPACE_IDS } from '../helpers/action-space-categories'

const CARD_ID = 'B155_ArtTeacher'
const TRAVELING_PLAYERS_FOOD = `${CARD_ID}:traveling-players-food` as const

/**
 * B155 Art Teacher (Occupation, 4+ players).
 *
 * Rule:
 *   - onBuy → gain 1 wood + 1 reed.
 *   - onPlayerComputeCostsOccupation → occupation cost can use food from
 *     the Traveling Players accumulation space.
 *
 * Implementation:
 *   - occupation after-listener (existing) triggers the wood+reed gain.
 *   - occupation computeCosts listener provides a card-scoped payment
 *     resource backed by Traveling Players food.
 */

const onBuyListener: CardListenerRegistration = {
  id: 'B155-art-teacher-onbuy',
  cardIds: [CARD_ID],
  actions: ['occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    return { flow: gainLeaf(CARD_ID, { wood: 1, reed: 1 }), sourceCard: CARD_ID }
  },
}

const computeCostsListener: CardListenerRegistration = {
  id: 'B155-art-teacher-compute-costs',
  cardIds: [CARD_ID],
  actions: ['occupation'],
  phases: ['computeCosts' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const tp = findTravelingPlayersSpace(context.state.actionSpaces)
    const tpFood = tp?.resources?.food ?? 0
    if (tpFood <= 0) return

    return {
      paymentResourceProviders: [
        {
          key: TRAVELING_PLAYERS_FOOD,
          sourceCard: CARD_ID,
          available: tpFood,
          covers: [{ resource: 'food', costAmount: 1, paymentAmount: 1 }],
          consume: { type: 'actionSpace', spaceId: tp!.id, resource: 'food' },
        },
      ],
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [onBuyListener, computeCostsListener],
  reaches: TRAVELING_PLAYERS_SPACE_IDS,
} satisfies CardImpl

export const B155_ArtTeacher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Art Teacher',
    deck: 'B',
    number: 155,
    category: 'GOODS_PROVIDER',
    desc: [
        'When you play this card, you immediately get 1 <WOOD> and 1 <REED>. Each time you pay an occupation cost, you can use <FOOD> from the __Traveling Players__ accumulation space.',
      ],
    cost: {},
    players: '4+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const B155_ArtTeacher_impl = B155_ArtTeacher.impl

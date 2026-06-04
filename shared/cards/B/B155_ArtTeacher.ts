import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B155_ArtTeacher'
const TRAVELING_PLAYERS = 'traveling-players'

/**
 * B155 Art Teacher (Occupation, 4+ players).
 *
 * BGA (B155_ArtTeacher.php):
 *   - onBuy → gain 1 wood + 1 reed.
 *   - onPlayerComputeCostsOccupation → derive alternative trades where 1..N
 *     food of the occupation cost can be paid as FOOD_TRAVEL (food on the
 *     Traveling Players accumulation space).
 *
 * Implementation:
 *   - occupation after-listener (existing) triggers the wood+reed gain.
 *   - occupation computeCosts listener injects a Trade
 *     {from:{}, to:{food:1}, max:tpFood, sideEffect:drainSpace(traveling-players,
 *     food)}. The standard payment solver enumerates 0..tpFood uses, the
 *     player picks via selectPayment, and applyTradeSideEffect drains TP food
 *     equal to the chosen times. Covers any occupation cost entry (lessons /
 *     lessons-4 / anytime occupation cards) without a separate before listener.
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
    const tp = context.state.actionSpaces.find((s) => s.id === TRAVELING_PLAYERS)
    const tpFood = tp?.resources?.food ?? 0
    if (tpFood <= 0) return

    return {
      trades: [
        {
          from: {},
          to: { food: 1 },
          max: tpFood,
          source: 'B155',
          sourceId: CARD_ID,
          sideEffect: {
            type: 'drainSpace',
            spaceId: TRAVELING_PLAYERS,
            resource: 'food',
          },
        },
      ],
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [onBuyListener, computeCostsListener],
  reaches: [TRAVELING_PLAYERS] as readonly string[],
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

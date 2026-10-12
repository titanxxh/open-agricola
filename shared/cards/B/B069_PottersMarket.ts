import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B069_PottersMarket'
const anytimeListener: CardListenerRegistration = {
  id: 'B69-potters-market-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if ((context.player.resources.clay ?? 0) < 3) return
    if ((context.player.resources.food ?? 0) < 2) return
    if (context.state.round >= 14) return // no future rounds
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { clay: 3, food: 2 } }),
          futureMeeplesNode({ cardId: CARD_ID, playerId: context.player.id,
            startRound: context.state.round + 1, count: 2, resources: { vegetable: 1 } }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: { id: CARD_ID },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B069_PottersMarket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Potter's Market",
    deck: 'B',
    number: 69,
    category: 'CROP_PROVIDER',
    desc: ['At any time, you can pay 3 <CLAY> and 2 <FOOD>. If you do, place 1 <VEGETABLE> on each of the next 2 round spaces. At the start of these rounds, you get the <VEGETABLE>.'],
    cost: { wood: 2 },
    vp: 1,
  },
  impl: cardImpl,
})

export const B069_PottersMarket_impl = B069_PottersMarket.impl

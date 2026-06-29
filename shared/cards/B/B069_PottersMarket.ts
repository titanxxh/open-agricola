import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { initCardState } from '../__stubs__/helpers'
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
          // Store 2 pending vegetable rounds via store-on-card (adds to counter 'pending')
          {
            type: 'leaf',
            actionId: 'store-on-card',
            params: { pending: 2 },
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.B069_PottersMarket.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const pending = player.cardStates?.[CARD_ID]?.counters?.pending ?? 0
    if (pending <= 0) return
    const counters = initCardState(player, CARD_ID)
    counters.pending = pending - 1
    return gainLeaf(CARD_ID, { vegetable: 1 })
  },
},
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

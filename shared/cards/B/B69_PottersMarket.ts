import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { initCardState } from '../__stubs__/helpers'
import type { CardImpl } from '../registry'
import { B69_PottersMarket } from '../../cards-display/B/B69_PottersMarket'

const CARD_ID = B69_PottersMarket.id

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
      labelKey: 'cards.B69_PottersMarket.anytime',
    }
  },
}

export const B69_PottersMarket_impl = {
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

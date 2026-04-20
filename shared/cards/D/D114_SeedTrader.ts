import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'D114_SeedTrader'

const anytimeListener: CardListenerRegistration = {
  id: 'D114-seed-trader-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.food < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          gainLeaf(CARD_ID, { grain: 1 }),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D114_SeedTrader.anytime',
    }
  },
}

export const D114_SeedTrader = new Occupation({
  id: CARD_ID,
  name: 'Seed Trader',
  deck: 'D',
  number: 114,
  category: 'CROP_PROVIDER',
  desc: [
    'Place 2 <GRAIN> and 2 <VEGETABLE> on this card. You can buy them at any time. Each <GRAIN> costs 2 <FOOD>; each <VEGETABLE> costs 3 <FOOD>.',
  ],
  cost: {},
  players: '1+',
})

export const D114_SeedTrader_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { grain: 2, vegetable: 2 }),
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

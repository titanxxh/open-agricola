import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C143_StoneBuyer'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'seq' as const,
    children: [
      payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
      gainLeaf(CARD_ID, { stone: 2 }),
      { type: 'leaf' as const, actionId: 'flag-card', sourceCard: CARD_ID },
    ],
  }),
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'C143-stone-buyer-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.food < 2) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
          gainLeaf(CARD_ID, { stone: 1 }),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C143_StoneBuyer.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const C143_StoneBuyer = new Occupation({
  id: CARD_ID,
  name: 'Stone Buyer',
  deck: 'C',
  number: 143,
  category: 'ACTIONS_BOOSTER',
  desc: ['When you play this card, you can immediately buy exactly 2 <STONE> for 1 <FOOD>. From the next round on, once per round, you can buy 1 <STONE> for 2 <FOOD>.'],
  cost: {},
  players: '3+',
})

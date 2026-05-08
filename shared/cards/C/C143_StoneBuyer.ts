import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C143_StoneBuyer } from '../../cards-display/C/C143_StoneBuyer'

const CARD_ID = C143_StoneBuyer.id

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
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C143_StoneBuyer.anytime',
    }
  },
}

export const C143_StoneBuyer_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'seq' as const,
    children: [
      payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
      gainLeaf(CARD_ID, { stone: 2 }),
      { type: 'leaf' as const, actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
    ],
  }),
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

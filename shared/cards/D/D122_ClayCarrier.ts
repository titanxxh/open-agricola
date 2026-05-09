import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D122_ClayCarrier } from '../../cards-display/D/D122_ClayCarrier'

const CARD_ID = D122_ClayCarrier.id

const anytimeListener: CardListenerRegistration = {
  id: 'D122-clay-carrier-anytime',
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
          gainLeaf(CARD_ID, { clay: 2 }),
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D122_ClayCarrier.anytime',
    }
  },
}

export const D122_ClayCarrier_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { clay: 2 }),
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

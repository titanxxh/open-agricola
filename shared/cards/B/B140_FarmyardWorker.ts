import { gainLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { B140_FarmyardWorker } from '../../cards-display/B/B140_FarmyardWorker'

const CARD_ID = B140_FarmyardWorker.id

const farmyardListener: CardListenerRegistration = {
  id: 'B140-farmyard-worker-after-farmyard',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables', 'fencing', 'construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    return {
      flow: { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
      sourceCard: CARD_ID,
    }
  },
}

export const B140_FarmyardWorker_impl = {
  listeners: [farmyardListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
  onBeforeReturnHome: (_state, player) => {
    if (!isCardFlagged(player, CARD_ID)) return
    return gainLeaf(CARD_ID, { food: 2 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

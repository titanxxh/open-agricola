import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'B140_FarmyardWorker'

// Listen for stables, fencing, construct (rooms) — any action that places goods on farmyard
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

export const B140_FarmyardWorker = new Occupation({
  id: CARD_ID,
  name: 'Farmyard Worker',
  deck: 'B',
  number: 140,
  category: 'FOOD_PROVIDER',
  desc: ['At the end of each work phase in which you placed at least 1 good on 1 of your farmyard spaces, you get 2 <FOOD>.'],
  cost: {},
  players: '3+',
  newSet: true,
})

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

import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'B140_FarmyardWorker'

// B140 Farmyard Worker: At the end of each work phase in which you placed at least 1 good
// on 1 of your farmyard spaces, you get 2 food.
// We use a flag: set it when any stable/fencing action is taken, then check at onBeforeReturnHome.
// The "placed a good on a farmyard space" refers to building: stable, fence, or room.

// Track flag reset at round start
registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
  },
  onBeforeReturnHome: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (!isCardFlagged(player, CARD_ID)) return
    return gainLeaf(CARD_ID, { food: 2 })
  },
})

// Listen for stables, fencing, construct (rooms) — any action that places goods on farmyard
const farmyardListener: CardListenerRegistration = {
  id: 'B140-farmyard-worker-after-farmyard',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables', 'fencing', 'construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (isCardFlagged(context.player, CARD_ID)) return
    return {
      flow: { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(farmyardListener)

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

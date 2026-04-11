import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A109_SmallTrader'

const listener: CardListenerRegistration = {
  id: 'A109-small-trader-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const choice = context.choice
    if (!choice || !choice.startsWith('minor:')) return
    return { flow: gainLeaf(CARD_ID, { food: 3 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const A109_SmallTrader = new Occupation({
  id: CARD_ID,
  name: "Small Trader",
  deck: "A",
  number: 109,
  category: "FOOD_PROVIDER",
  desc: ["Each time you take a __Major or Minor Improvement__ action, if you play a card from your hand instead of taking a major improvement from the board, you also get 3 <FOOD>."],
  cost: {},
  players: "1+",
  newSet: true,
})

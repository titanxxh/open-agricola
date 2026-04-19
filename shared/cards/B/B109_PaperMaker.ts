import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'B109_PaperMaker'

const computeCostsListener: CardListenerRegistration = {
  id: 'B109-paper-maker-compute-costs-occupation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const occupationCount = context.player.occupationPlayed.length
    if (occupationCount <= 0) return
    return {
      trades: [{
        from: { wood: 1 },
        to: { food: occupationCount },
        max: 1,
        source: CARD_ID,
        sourceId: CARD_ID,
      }],
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(computeCostsListener)

export const B109_PaperMaker = new Occupation({
  id: CARD_ID,
  name: "Paper Maker",
  deck: "B",
  number: 109,
  category: "FOOD_PROVIDER",
  desc: ["Immediately before playing each occupation after this one, you can pay 1 <WOOD> total to get 1 <FOOD> for each occupation you have in front of you."],
  cost: {},
  players: "1+",
})

import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'B109_PaperMaker'
const computeCostsListener: CardListenerRegistration = {
  id: 'B109-paper-maker-compute-costs-occupation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['occupation'],
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

const cardImpl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B109_PaperMaker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Paper Maker",
    deck: "B",
    number: 109,
    category: "FOOD_PROVIDER",
    desc: ["Immediately before playing each occupation after this one, you can pay 1 <WOOD> total to get 1 <FOOD> for each occupation you have in front of you."],
    cost: {},
    players: "1+",
    waresSalesmanGains: [{ wood: 1, reed: 1 }],
  },
  impl: cardImpl,
})

export const B109_PaperMaker_impl = B109_PaperMaker.impl

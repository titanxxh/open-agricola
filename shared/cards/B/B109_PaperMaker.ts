import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { payGainFlow } from '../helpers/pay-gain-node'

const CARD_ID = 'B109_PaperMaker'
const beforeOccupationListener: CardListenerRegistration = {
  id: 'B109-paper-maker-before-occupation',
  cardIds: [CARD_ID],
  phases: ['before'],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const occupationCount = context.player.occupationPlayed.length
    if (occupationCount <= 0) return
    return {
      flow: payGainFlow({
        cardId: CARD_ID,
        cost: { wood: 1 },
        gain: { food: occupationCount },
        choiceLabelKey: 'ui.interactionResourceExchange',
      }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [beforeOccupationListener],
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

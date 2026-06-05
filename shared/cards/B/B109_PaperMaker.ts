import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B109_PaperMaker'
const beforeListener: CardListenerRegistration = {
  id: 'B109-paper-maker-before-occupation',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const occupationCount = context.player.occupationPlayed.length
    if (occupationCount <= 0) return
    if ((context.player.resources.wood ?? 0) < 1) return
    return {
      flow: payGainFlow({
        cardId: CARD_ID,
        cost: { wood: 1 },
        gain: { food: occupationCount },
      }),
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'B109-paper-maker-isdoable-occupation',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (context.actionContext?.skipBeforeTriggers === true) return
    if (context.player.occupationPlayed.length <= 0) return
    if ((context.player.resources.wood ?? 0) < 1) return
    return { doable: true, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [beforeListener, isDoableListener],
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

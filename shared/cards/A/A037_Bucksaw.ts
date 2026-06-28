import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A037_Bucksaw'
const afterRenovateListener: CardListenerRegistration = {
  id: 'A37-bucksaw-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return payGainNode({
      cardId: CARD_ID,
      cost: { wood: 1 },
      gain: { grain: 1, score: 1 },
      promptKey: 'ui.interactionBucksawPrompt',
    })
  },
}

const cardImpl = {
  listeners: [afterRenovateListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A037_Bucksaw = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Bucksaw",
    deck: "A",
    number: 37,
    category: "POINTS_PROVIDER",
    desc: ["Each time you renovate, you can also pay 1 <WOOD> to get 1 bonus <SCORE> and 1 <GRAIN>."],
    cost: {"wood":1},
    extraVp: true,
  },
  impl: cardImpl,
})

export const A037_Bucksaw_impl = A037_Bucksaw.impl

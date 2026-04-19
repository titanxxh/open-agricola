import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'

const CARD_ID = 'A37_Bucksaw'

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

registerCardListener(afterRenovateListener)

export const A37_Bucksaw = new MinorImprovement({
  id: CARD_ID,
  name: "Bucksaw",
  deck: "A",
  number: 37,
  category: "POINTS_PROVIDER",
  desc: ["Each time you renovate, you can also pay 1 <WOOD> to get 1 bonus <SCORE> and 1 <GRAIN>."],
  cost: {"wood":1},
  newSet: true,
})

import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A37_Bucksaw } from '../../cards-display/A/A37_Bucksaw'
export { A37_Bucksaw }

const CARD_ID = A37_Bucksaw.id

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

export const A37_Bucksaw_impl = {
  listeners: [afterRenovateListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

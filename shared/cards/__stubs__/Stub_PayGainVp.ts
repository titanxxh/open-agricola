import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { incCounter } from './helpers'
import { payGainNode } from '../helpers/pay-gain-node'

export const CARD_ID = 'Stub_PayGainVp'

export const afterListener: CardListenerRegistration = {
  id: 'stub-pay-gain-vp-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['renovate-house'],
  handler: (context): ActionHookResult | void => {
    incCounter(context.player, CARD_ID, 'observedCount')
    return payGainNode({
      cardId: CARD_ID,
      cost: { wood: 1 },
      gain: { grain: 1, score: 1 },
      promptKey: 'ui.stubPayGainVpPrompt',
    })
  },
}

import type { CardListenerRegistration } from '../card-listeners'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_ComputeReplace_Decline'

export const listener: CardListenerRegistration = {
  id: 'stub-compute-replace-decline',
  cardIds: [CARD_ID],
  phases: ['computeReplace'],
  actions: ['sow'],
  handler: (context) => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      decline: true,
      alternativeFlow: { type: 'leaf', actionId: 'gain', params: { food: 1 } },
    }
  },
}

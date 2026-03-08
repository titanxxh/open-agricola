import type { CardListenerRegistration } from '../card-listeners'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_ComputeArgs_ExtraOption'

export const listener: CardListenerRegistration = {
  id: 'stub-computeargs-extra-option',
  cardIds: [CARD_ID],
  phases: ['computeArgs'],
  actions: ['improvement-any'],
  handler: (context) => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      extraOptions: [{ value: 'stub-bonus-improvement', labelKey: 'ui.stubBonus' }],
    }
  },
}

import type { CardListenerRegistration } from '../card-listeners'
import { observe } from './helpers'

export const CARD_ID = 'Stub_ComputeArgs_ExtraOption'

export const listener: CardListenerRegistration = {
  id: 'stub-computeargs-extra-option',
  cardIds: [CARD_ID],
  phases: ['computeArgs'],
  actions: ['improvement-any'],
  handler: (context) => {
    observe(context.player, CARD_ID)
    return {
      extraOptions: [{ value: 'stub-bonus-improvement', labelKey: 'ui.stubBonus' }],
    }
  },
}

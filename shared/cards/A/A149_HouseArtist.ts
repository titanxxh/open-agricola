import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { A149_HouseArtist } from '../../cards-display/A/A149_HouseArtist'

const CARD_ID = A149_HouseArtist.id

const triggerListener: CardListenerRegistration = {
  id: 'A149-house-artist-after-traveling-players',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'traveling-players') return
    return {
      flow: {
        type: 'leaf',
        actionId: 'construct',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

const costListener: CardListenerRegistration = {
  id: 'A149-house-artist-compute-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    return { costs: { reed: -1 } }
  },
}

export const A149_HouseArtist_impl = {
  listeners: [triggerListener, costListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { B109_PaperMaker } from '../../cards-display/B/B109_PaperMaker'
export { B109_PaperMaker }

const CARD_ID = B109_PaperMaker.id

const computeCostsListener: CardListenerRegistration = {
  id: 'B109-paper-maker-compute-costs-occupation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const occupationCount = context.player.occupationPlayed.length
    if (occupationCount <= 0) return
    return {
      trades: [{
        from: { wood: 1 },
        to: { food: occupationCount },
        max: 1,
        source: CARD_ID,
        sourceId: CARD_ID,
      }],
      sourceCard: CARD_ID,
    }
  },
}

export const B109_PaperMaker_impl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { D15_ClaySupports } from '../../cards-display/D/D15_ClaySupports'

const CARD_ID = D15_ClaySupports.id

const computeCostsListener: CardListenerRegistration = {
  id: 'D15-clay-supports-compute-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'clay') return
    return {
      trades: [{
        from: { wood: 1 },
        to: { clay: 3, reed: 1 },
        source: CARD_ID,
        sourceId: CARD_ID,
      }],
      sourceCard: CARD_ID,
    }
  },
}

export const D15_ClaySupports_impl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

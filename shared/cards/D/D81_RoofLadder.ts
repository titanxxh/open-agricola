import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D81_RoofLadder } from '../../cards-display/D/D81_RoofLadder'
export { D81_RoofLadder }

const CARD_ID = D81_RoofLadder.id

const costListener: CardListenerRegistration = {
  id: 'D81-roof-ladder-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { costs: { reed: -1 } }
  },
}

const afterListener: CardListenerRegistration = {
  id: 'D81-roof-ladder-after-renovation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

export const D81_RoofLadder_impl = {
  listeners: [costListener, afterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

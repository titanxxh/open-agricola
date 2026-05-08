import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getRenovation } from '../../actions/effects/renovation'
import type { CardImpl } from '../registry'
import { B128_Plumber } from '../../cards-display/B/B128_Plumber'
export { B128_Plumber }

const CARD_ID = B128_Plumber.id

const triggerListener: CardListenerRegistration = {
  id: 'B128-plumber-after-place-farmer-major-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'major-improvement') return
    // Only offer if renovation is actually possible
    const renovation = getRenovation(context.player)
    if (!renovation) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'renovate-house',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

const costListener: CardListenerRegistration = {
  id: 'B128-plumber-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    const renovation = getRenovation(context.player)
    if (!renovation) return
    if (renovation.nextType === 'clay') {
      return { costs: { clay: -2 } }
    }
    if (renovation.nextType === 'stone') {
      return { costs: { stone: -2 } }
    }
  },
}

export const B128_Plumber_impl = {
  listeners: [triggerListener, costListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

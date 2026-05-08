import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { A20_DoubleTurnPlow } from '../../cards-display/A/A20_DoubleTurnPlow'
export { A20_DoubleTurnPlow }

const CARD_ID = A20_DoubleTurnPlow.id

registerPrerequisite('Round 5 or Before', (_player, state) => {
  if (!state) return true
  return state.round <= 5
})

const computeCostsListener: CardListenerRegistration = {
  id: 'A20-double-turn-plow-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['minor-improvement', 'improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.cardId !== CARD_ID) return
    if (context.state.round <= 3) return
    return { costs: { food: 1 } }
  },
}

export const A20_DoubleTurnPlow_impl = {
  listeners: [computeCostsListener],
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'seq' as const,
    optional: true,
    children: [
      { type: 'leaf' as const, actionId: 'plow', sourceCard: CARD_ID, optional: true },
      { type: 'leaf' as const, actionId: 'plow', sourceCard: CARD_ID, optional: true },
    ],
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

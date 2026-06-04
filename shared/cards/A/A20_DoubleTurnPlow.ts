import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'A20_DoubleTurnPlow'
const computeCostsListener: CardListenerRegistration = {
  id: 'A20-double-turn-plow-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.cardId !== CARD_ID) return
    if (context.state.round <= 3) return
    return { costs: { food: 1 } }
  },
}

const cardImpl = {
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
  prerequisiteCheck: (_player, state) => {
    if (!state) return true
    return state.round <= 5
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A20_DoubleTurnPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Double-Turn Plow',
    deck: 'A',
    number: 20,
    category: 'FARM_PLANNER',
    desc: ['When you play this card, you can immediately plow up to 2 fields.'],
    cost: { grain: 1 },
    maxRound: 5,
    prerequisite: 'Play in Round 3 (5) or Before',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const A20_DoubleTurnPlow_impl = A20_DoubleTurnPlow.impl

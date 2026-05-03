import { MinorImprovement } from '../types'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'A20_DoubleTurnPlow'

// BGA isBuyable: turn > 5 → false. Already redundantly enforced by maxRound,
// but register the explicit handler so the prereq label is not silently passed.
registerPrerequisite('Round 5 or Before', (_player, state) => {
  if (!state) return true
  return state.round <= 5
})

// computeCosts: add 1 food after round 3
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

export const A20_DoubleTurnPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Double-Turn Plow',
  deck: 'A',
  number: 20,
  category: 'FARM_PLANNER',
  desc: ['When you play this card, you can immediately plow up to 2 fields.'],
  cost: { grain: 1 },
  maxRound: 5,
  prerequisite: 'Round 5 or Before',
  evenMoreSet: true,
})

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

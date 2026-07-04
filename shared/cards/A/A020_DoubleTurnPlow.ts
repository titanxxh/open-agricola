import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A020_DoubleTurnPlow'
const cardImpl = {
  getBaseCosts: ({ state }) => [{ grain: 1, food: state.round > 3 ? 1 : 0 }],
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

export const A020_DoubleTurnPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Double-Turn Plow',
    deck: 'A',
    number: 20,
    category: 'FARM_PLANNER',
    desc: ['When you play this card, you can immediately plow up to 2 <FIELD>.'],
    cost: { grain: 1 },
    maxRound: 5,
    prerequisite: 'Play in Round 3 (5) or Before',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const A020_DoubleTurnPlow_impl = A020_DoubleTurnPlow.impl

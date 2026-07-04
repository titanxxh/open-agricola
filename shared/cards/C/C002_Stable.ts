import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C002_Stable'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'leaf' as const,
      actionId: 'stables',
      sourceCard: CARD_ID,
      actionContext: { max: 1, exactCost: { wood: 0, max: 1 }, cancelPolicy: 'forbidCancel' },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C002_Stable = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Stable",
    deck: "C",
    number: 2,
    category: "FARM_PLANNER",
    desc: ["Immediately build 1 <STABLE>. (The <STABLE> costs you nothing, but you must pay the cost shown on this card.)"],
    cost: { wood: 1 },
    passing: true,
  },
  impl: cardImpl,
})

export const C002_Stable_impl = C002_Stable.impl

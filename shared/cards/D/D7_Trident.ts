import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D7_Trident'
const ROUND_FOOD: Record<number, number> = { 3: 3, 6: 4, 9: 5, 12: 6 }

const cardImpl = {
  prerequisiteCheck: (_player, state) => {
    if (!state) return true
    return [3, 6, 9, 12].includes(state.round)
  },
  effect: {
  id: CARD_ID,
  onBuy: (state) => {
    const gain = ROUND_FOOD[state.round]
    if (gain) {
      return { type: 'seq', children: [gainLeaf(CARD_ID, { food: gain })] }
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D7_Trident = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Trident",
    deck: "D",
    number: 7,
    category: "FOOD_PROVIDER",
    desc: ["If you play this card in round 3/6/9/12, you immediately get 3/4/5/6 <FOOD>."],
    cost: { wood: 1 },
    passing: true,
    prerequisite: 'Play in Round 3, 6, 9, or 12',
  },
  impl: cardImpl,
})

export const D7_Trident_impl = D7_Trident.impl

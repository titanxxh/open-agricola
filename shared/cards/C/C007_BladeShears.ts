import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C007_BladeShears'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const sheep = player.resources.sheep ?? 0
    return {
      type: 'xor' as const,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { food: 3 },
        },
        {
          type: 'leaf' as const,
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { food: sheep },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C007_BladeShears = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Blade Shears",
    deck: "C",
    number: 7,
    category: "FOOD_PROVIDER",
    desc: ["You immediately get your choice of 3 <FOOD>, or 1 <FOOD> for each <SHEEP> you have. (Keep the <SHEEP>.)"],
    cost: { wood: 1 },
    passing: true,
    prerequisite: "1 Pasture",
  },
  impl: cardImpl,
})

export const C007_BladeShears_impl = C007_BladeShears.impl

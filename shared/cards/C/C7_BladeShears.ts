import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C7_BladeShears'

export const C7_BladeShears = new MinorImprovement({
  id: CARD_ID,
  name: "Blade Shears",
  deck: "C",
  number: 7,
  category: "ANIMAL_HANDLER",
  desc: ["You immediately get your choice of 3 <FOOD>, or 1 <FOOD> for each sheep you have. (Keep the sheep.)"],
  cost: { wood: 1 },
  passing: true,
  prerequisite: "1 Pasture",
  newSet: true,
})

export const C7_BladeShears_impl = {
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

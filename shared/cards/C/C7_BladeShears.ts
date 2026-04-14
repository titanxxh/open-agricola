import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C7_BladeShears'

registerCardEffect({
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
})

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

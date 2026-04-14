import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D7_Trident'

const ROUND_FOOD: Record<number, number> = { 3: 3, 6: 4, 9: 5, 12: 6 }

registerCardEffect({
  id: CARD_ID,
  onBuy: (state) => {
    const gain = ROUND_FOOD[state.round]
    if (gain) {
      return { type: 'seq', children: [gainLeaf(CARD_ID, { food: gain })] }
    }
  },
})

export const D7_Trident = new MinorImprovement({
  id: CARD_ID,
  name: "Trident",
  deck: "D",
  number: 7,
  category: "FOOD_PROVIDER",
  desc: ["If you play this card in round 3/6/9/12, you immediately get 3/4/5/6 <FOOD>."],
  cost: { wood: 1 },
  passing: true,
})

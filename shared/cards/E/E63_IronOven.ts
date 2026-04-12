import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E63_IronOven'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'bake-bread',
    sourceCard: CARD_ID,
    optional: true,
  }),
})

export const E63_IronOven = new MinorImprovement({
  id: CARD_ID,
  name: "Iron Oven",
  deck: "E",
  number: 63,
  category: "FOOD_GRAIN",
  desc: ["[Bake Bread action:] 1 <GRAIN> → 6 <FOOD>"],
  cost: { stone: 3 },
  vp: 2,
  isBaking: true,
  exchanges: [
    { from: { grain: 1 }, to: { food: 6 }, max: 1, trigger: 'bake-bread' },
  ],
})

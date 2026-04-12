import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E64_SimpleOven'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'bake-bread',
    sourceCard: CARD_ID,
    optional: true,
  }),
})

export const E64_SimpleOven = new MinorImprovement({
  id: CARD_ID,
  name: "Simple Oven",
  deck: "E",
  number: 64,
  category: "FOOD_GRAIN",
  desc: ["[Bake Bread action:] 1 <GRAIN> → 3 <FOOD>"],
  cost: { clay: 2 },
  vp: 1,
  isBaking: true,
  exchanges: [
    { from: { grain: 1 }, to: { food: 3 }, max: 1, trigger: 'bake-bread' },
  ],
})

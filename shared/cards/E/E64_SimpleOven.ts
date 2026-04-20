import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E64_SimpleOven'

export const E64_SimpleOven = new MinorImprovement({
  id: CARD_ID,
  name: "Simple Oven",
  deck: "E",
  number: 64,
  category: "FOOD_GRAIN",
  desc: [
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW-1X> 3<FOOD>',
    'When you play this card, you can immediately take a __Bake Bread__ action.',
  ],
  cost: { clay: 2 },
  vp: 1,
  isBaking: true,
  exchanges: [
    { from: { grain: 1 }, to: { food: 3 }, max: 1, trigger: 'bake-bread' },
  ],
})

export const E64_SimpleOven_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'bake-bread',
    sourceCard: CARD_ID,
    optional: true,
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E63_IronOven'

export const E63_IronOven = new MinorImprovement({
  id: CARD_ID,
  name: "Iron Oven",
  deck: "E",
  number: 63,
  category: "FOOD_-_GRAIN",
  desc: [
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW-1X> 6<FOOD>',
    'When you play this card, you can immediately take a __Bake Bread__ action.',
  ],
  cost: { stone: 3 },
  vp: 2,
  isBaking: true,
  exchanges: [
    { from: { grain: 1 }, to: { food: 6 }, max: 1, triggers: ['bake-bread'] },
  ],
})

export const E63_IronOven_impl = {
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

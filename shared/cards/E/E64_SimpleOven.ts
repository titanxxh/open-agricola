import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E64_SimpleOven'

const cardImpl = {
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

export const E64_SimpleOven = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Simple Oven",
    deck: "E",
    number: 64,
    category: "FOOD_-_GRAIN",
    desc: [
        '[__Bake Bread__ action:]',
        '<GRAIN> <ARROW-1X> 3<FOOD>',
        'When you play this card, you can immediately take a __Bake Bread__ action.',
      ],
    cost: { clay: 2 },
    vp: 1,
    isBaking: true,
    ovenIdentity: true,
    exchanges: [
        { from: { grain: 1 }, to: { food: 3 }, max: 1, triggers: ['bake-bread'] },
      ],
  },
  impl: cardImpl,
})

export const E64_SimpleOven_impl = E64_SimpleOven.impl

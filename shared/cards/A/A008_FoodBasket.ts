import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A008_FoodBasket'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'gain',
    sourceCard: CARD_ID,
    params: { grain: 1, vegetable: 1 },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A008_FoodBasket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Food Basket',
    deck: 'A',
    number: 8,
    category: 'CROP_PROVIDER',
    desc: ['You immediately get 1 <GRAIN> and 1 <VEGETABLE>.'],
    cost: { reed: 1 },
    passing: true,
    prerequisite: '2 Occupations and 2 Improvements',
    occupationPrerequisites: { min: 2 },
    improvementPrerequisites: { min: 2 },
  },
  impl: cardImpl,
})

export const A008_FoodBasket_impl = A008_FoodBasket.impl

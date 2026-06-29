import { defineMinorCard } from '../card-source'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'B036_Bottles'
/**
 * B36 Bottles (Minor Improvement):
 * Worth 4 VP. Dynamic cost: for each person you have, pay 1 clay + 1 food.
 *
 * BGA reference:
 * - getBaseCosts: clay = farmers, food = farmers
 * - vp: 4
 */

const cardImpl = {
  getBaseCosts: ({ player }) => {
    const farmers = familySize(player)
    return [{ clay: farmers, food: farmers }]
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B036_Bottles = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Bottles',
    deck: 'B',
    number: 36,
    category: 'POINTS_PROVIDER',
    desc: ['For each person you have, you must pay an additional 1 <CLAY> and 1 <FOOD> to play this card.'],
    cost: {},
    vp: 4,
  },
  impl: cardImpl,
})

export const B036_Bottles_impl = B036_Bottles.impl

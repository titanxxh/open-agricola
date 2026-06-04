import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E1_PoleBarns'

const cardImpl = {
  prerequisiteCheck: (player) => player.fenceSegments.length >= 15,
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'stables',
    sourceCard: CARD_ID,
    optional: true,
    actionContext: { max: 3, exactCost: { wood: 0, max: 3 } },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E1_PoleBarns = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Pole Barns',
    deck: 'E',
    number: 1,
    category: 'PASSING_-_FARMYARD',
    desc: ['You can immediately build up to 3 stables at no cost. (You must pay the cost of this card though.)'],
    cost: { wood: 2 },
    passing: true,
    prerequisite: '15 Fences Built',
  },
  impl: cardImpl,
})

export const E1_PoleBarns_impl = E1_PoleBarns.impl

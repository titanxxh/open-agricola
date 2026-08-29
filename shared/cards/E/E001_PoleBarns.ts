import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { getFenceCount } from '../../domain/fence-segments'

const CARD_ID = 'E001_PoleBarns'

const cardImpl = {
  prerequisiteCheck: (player) => getFenceCount(player) >= 15,
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

export const E001_PoleBarns = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Pole Barns',
    deck: 'E',
    number: 1,
    category: 'PASSING_-_FARMYARD',
    desc: ['You can immediately build up to 3 <STABLE> at no cost. (You must pay the cost of this card though.)'],
    cost: { wood: 2 },
    passing: true,
    prerequisite: '15 Fences Built',
  },
  impl: cardImpl,
})

export const E001_PoleBarns_impl = E001_PoleBarns.impl

import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A5_ClayEmbankment'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const clay = player.resources.clay
    if (clay < 2) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { clay: Math.floor(clay / 2) },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A5_ClayEmbankment = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Clay Embankment',
    deck: 'A',
    number: 5,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['You immediately get 1 <CLAY> for every 2 <CLAY> you already have in your supply.'],
    cost: { food: 1 },
    passing: true,
  },
  impl: cardImpl,
})

export const A5_ClayEmbankment_impl = A5_ClayEmbankment.impl

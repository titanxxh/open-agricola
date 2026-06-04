import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E6_Recount'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const types: Array<[keyof typeof player.resources, string]> = [
      ['wood', 'wood'],
      ['clay', 'clay'],
      ['reed', 'reed'],
      ['stone', 'stone'],
    ]
    const gains: Partial<typeof player.resources> = {}
    for (const [key] of types) {
      if ((player.resources[key] ?? 0) >= 4) {
        gains[key] = 1
      }
    }
    if (Object.keys(gains).length === 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: gains,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E6_Recount = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Recount',
    deck: 'E',
    number: 6,
    category: 'PASSING_-_BUILDING_RESOURCES_',
    desc: ['You immediately get 1 building resource of each type of which you have 4 or more resources in your supply already.'],
    passing: true,
  },
  impl: cardImpl,
})

export const E6_Recount_impl = E6_Recount.impl

import { defineMinorCard } from '../card-source'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'A4_Baseboards'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const rooms = player.rooms
    const farmers = familySize(player)
    const amount = rooms + (rooms > farmers ? 1 : 0)
    if (amount <= 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: amount },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A4_Baseboards = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Baseboards',
    deck: 'A',
    number: 4,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['You immediately get 1 <WOOD> for each room you have. If you have more rooms than people, you get 1 additional <WOOD>.'],
    altCosts: [{ food: 2 }, { grain: 1 }],
    passing: true,
  },
  impl: cardImpl,
})

export const A4_Baseboards_impl = A4_Baseboards.impl

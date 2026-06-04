import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C10_BunkBeds'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeExtraRoomCapacity: (player) => {
    return player.rooms >= 4 ? 1 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C10_BunkBeds = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Bunk Beds',
    deck: 'C',
    number: 10,
    category: 'FARM_PLANNER',
    desc: ['Once you have 4 rooms, your house can hold 5 people.'],
    cost: { wood: 1 },
    prerequisite: '2 Major Improvements',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const C10_BunkBeds_impl = C10_BunkBeds.impl

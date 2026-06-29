import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'B010_Caravan'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeExtraRoomCapacity: (player) =>
      player.minorPlayed.includes(CARD_ID) ? 1 : 0,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B010_Caravan = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Caravan',
    deck: 'B',
    number: 10,
    category: 'FARM_PLANNER',
    desc: ['This card provides room for 1 person.'],
    cost: { wood: 3, food: 3 },
  },
  impl: cardImpl,
})

export const B010_Caravan_impl = B010_Caravan.impl

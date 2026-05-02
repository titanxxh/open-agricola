import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B10_Caravan'

export const B10_Caravan = new MinorImprovement({
  id: CARD_ID,
  name: 'Caravan',
  deck: 'B',
  number: 10,
  category: 'FARM_PLANNER',
  desc: ['This card provides room for 1 person.'],
  cost: { wood: 3, food: 3 },
})

export const B10_Caravan_impl = {
  effect: {
    id: CARD_ID,
    computeExtraRoomCapacity: (player) =>
      player.minorPlayed.includes(CARD_ID) ? 1 : 0,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

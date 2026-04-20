import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B12_Stockyard'

export const B12_Stockyard = new MinorImprovement({
  id: CARD_ID,
  name: 'Stockyard',
  deck: 'B',
  number: 12,
  category: 'FARM_PLANNER',
  desc: ['This card can hold up to 3 animals of the same type. (It is not considered a pasture).'],
  cost: { wood: 1, stone: 1 },
  vp: 1,
  newSet: true,
})

export const B12_Stockyard_impl = {
  effect: {
  id: CARD_ID,
  onComputeAnimalZones: (_player, zones) => {
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity: 3,
      animalType: null,
      animalCount: 0,
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

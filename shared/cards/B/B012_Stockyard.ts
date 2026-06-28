import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'B012_Stockyard'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onComputeAnimalZones: (_player, zones, _state) => {
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

export const B012_Stockyard = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Stockyard',
    deck: 'B',
    number: 12,
    category: 'FARM_PLANNER',
    desc: ['This card can hold up to 3 animals of the same type. (It is not considered a pasture).'],
    cost: { wood: 1, stone: 1 },
    animalHolder: true,
    vp: 1,
  },
  impl: cardImpl,
})

export const B012_Stockyard_impl = B012_Stockyard.impl

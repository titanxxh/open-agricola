import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C11_WildlifeReserve'

export const C11_WildlifeReserve = new MinorImprovement({
  id: CARD_ID,
  name: 'Wildlife Reserve',
  deck: 'C',
  number: 11,
  category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
  desc: ['This card can hold up to 1 <SHEEP>, 1 <PIG>, and 1 <CATTLE>.'],
  cost: { wood: 2 },
  vp: 1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})

export const C11_WildlifeReserve_impl = {
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

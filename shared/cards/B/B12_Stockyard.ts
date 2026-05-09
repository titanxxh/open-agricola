import type { CardImpl } from '../registry'
import { B12_Stockyard } from '../../cards-display/B/B12_Stockyard'

const CARD_ID = B12_Stockyard.id

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

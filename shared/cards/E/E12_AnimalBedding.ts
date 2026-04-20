import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E12_AnimalBedding'

export const E12_AnimalBedding = new MinorImprovement({
  id: CARD_ID,
  name: 'Animal Bedding',
  deck: 'E',
  number: 12,
  category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
  desc: ['You can keep 1 additional animal (of the same type) in each of your unfenced stables, and 2 additional animals (of the same type) in each pasture with stable.'],
  cost: {},
  vp: 1,
  prerequisite: '1 Grain Field',
})

export const E12_AnimalBedding_impl = {
  effect: {
  id: CARD_ID,
  onComputeAnimalZones: (player, zones) => {
    // Collect pasture IDs that have stables
    const stabledPastureIndices = new Set<number>(
      player.pastures
        .map((p, i) => (p.stables > 0 ? i : -1))
        .filter((i) => i >= 0),
    )
    for (const zone of zones) {
      if (zone.zoneType === 'stable') {
        // Unfenced stable: +1 capacity
        zone.capacity += 1
      } else if (zone.zoneType === 'pasture' && zone.pastureIndex !== undefined) {
        if (stabledPastureIndices.has(zone.pastureIndex)) {
          // Pasture with stable: +2 capacity
          zone.capacity += 2
        }
      }
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

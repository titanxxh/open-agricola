import type { CardImpl } from '../registry'
import { E12_AnimalBedding } from '../../cards-display/E/E12_AnimalBedding'
export { E12_AnimalBedding }

const CARD_ID = E12_AnimalBedding.id

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

import type { CardImpl } from '../registry'
import { E36_HerbalGarden } from '../../cards-display/E/E36_HerbalGarden'

const CARD_ID = E36_HerbalGarden.id

export const E36_HerbalGarden_impl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (_player, zones) => {
      // At least one pasture must contain no animals.
      // Find the best pasture to block: prefer one that's already empty,
      // otherwise pick the one with the smallest capacity.
      const pastures = zones.filter(z => z.zoneType === 'pasture')
      if (pastures.length === 0) return
      // First try to find an already-empty pasture (animalCount === 0)
      const emptyPasture = pastures.find(p => (p.animalCount ?? 0) === 0)
      if (emptyPasture) {
        emptyPasture.capacity = 0
        return
      }
      // No empty pasture — block the one with smallest capacity
      const sorted = [...pastures].sort((a, b) => a.capacity - b.capacity)
      sorted[0]!.capacity = 0
    },
    /**
     * BGA `Models/PlayerBoard.php::getInvalidAnimals` (E36 branch):
     * "at least one pasture must contain no animals". We enforce via
     * `onComputeAnimalZones` setting cap=0 on a chosen pasture, forcing
     * overflow on reorg. Hook returns [] because the constraint is not
     * card-zone-local.
     */
    getInvalidAnimals: () => [],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

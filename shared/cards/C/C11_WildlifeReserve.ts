import type { CardImpl } from '../registry'
import { C11_WildlifeReserve } from '../../cards-display/C/C11_WildlifeReserve'
export { C11_WildlifeReserve }

const CARD_ID = C11_WildlifeReserve.id

export const C11_WildlifeReserve_impl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (_player, zones) => {
      zones.push({
        id: `card:${CARD_ID}`,
        zoneType: 'card',
        cardId: CARD_ID,
        capacity: 3,
        animalType: null,
        animalCount: 0,
      })
    },
    /**
     * BGA `Cards/C/C11_WildlifeReserve.php::getInvalidAnimals`:
     * counter per type; if same type appears more than once → invalid.
     * Mirrors the per-type cap of 1 sheep + 1 pig + 1 cattle.
     */
    getInvalidAnimals: (_player, _zone, meeples) => {
      const counters: Record<string, number> = { sheep: 0, boar: 0, cattle: 0 }
      const invalid: typeof meeples = []
      for (const meeple of meeples) {
        counters[meeple.type] = (counters[meeple.type] ?? 0) + 1
        if (counters[meeple.type]! > 1) invalid.push(meeple)
      }
      return invalid
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

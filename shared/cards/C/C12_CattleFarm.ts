import type { CardImpl } from '../registry'
import { C12_CattleFarm } from '../../cards-display/C/C12_CattleFarm'

const CARD_ID = C12_CattleFarm.id

export const C12_CattleFarm_impl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (player, zones, _state) => {
      const pastureCount = player.pastures.length
      if (pastureCount === 0) return
      zones.push({
        id: `card:${CARD_ID}`,
        zoneType: 'card',
        cardId: CARD_ID,
        capacity: pastureCount,
        animalType: 'cattle',
        animalCount: 0,
      })
    },
    /**
     * BGA `Cards/C/C12_CattleFarm.php::getInvalidAnimals`:
     * dynamic cap = pasture count; meeples beyond cap are invalid.
     */
    getInvalidAnimals: (player, _zone, meeples) => {
      const cap = player.pastures.length
      const invalid: typeof meeples = []
      meeples.forEach((meeple, idx) => {
        if (idx >= cap) invalid.push(meeple)
      })
      return invalid
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

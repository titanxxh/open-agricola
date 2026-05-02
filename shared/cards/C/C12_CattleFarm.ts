import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C12_CattleFarm'

export const C12_CattleFarm = new MinorImprovement({
  id: CARD_ID,
  name: 'Cattle Farm',
  deck: 'C',
  number: 12,
  category: 'FARM_PLANNER',
  desc: ['For each pasture you have, you can keep 1 <CATTLE> on this card.'],
  cost: { wood: 1 },
})

export const C12_CattleFarm_impl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (player, zones) => {
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

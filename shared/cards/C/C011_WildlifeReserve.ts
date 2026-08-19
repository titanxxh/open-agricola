import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C011_WildlifeReserve'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (_player, zones, _state) => {
      zones.push({
        id: `card:${CARD_ID}`,
        zoneType: 'card',
        cardId: CARD_ID,
        capacity: 3,
        animalType: null,
        animalCount: 0,
        allowedAnimalType: null,
      })
    },
    /**
     * The reference `Cards/C/the reference::getInvalidAnimals`:
     * counter per type; if same type appears more than once → invalid.
     * Mirrors the per-type cap of 1 sheep + 1 pig + 1 cattle.
     */
    getInvalidAnimals: (_player, _zone, meeples) => {
      const counters: Record<string, number> = { sheep: 0, boar: 0, cattle: 0 }
      const invalid: typeof meeples = []
      for (const meeple of meeples) {
        if (!(meeple.type in counters)) {
          invalid.push(meeple)
          continue
        }
        counters[meeple.type] = (counters[meeple.type] ?? 0) + 1
        if (counters[meeple.type]! > 1) invalid.push(meeple)
      }
      return invalid
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C011_WildlifeReserve = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Wildlife Reserve',
    deck: 'C',
    number: 11,
    category: 'FARM_PLANNER',
    desc: ['This card can hold up to 1 <SHEEP>, 1 <PIG>, and 1 <CATTLE>.'],
    cost: { wood: 2 },
    animalHolder: true,
    vp: 1,
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
  },
  impl: cardImpl,
})

export const C011_WildlifeReserve_impl = C011_WildlifeReserve.impl

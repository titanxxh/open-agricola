import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { buildFarmyardCardAnimalZone } from '../../domain/animal-zones'
import { getVisibleTerrainTiles } from '../../moor/farm-terrain'

const CARD_ID = 'M034_HomeWood'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (player, zones, _state) => {
      getVisibleTerrainTiles(player, 'forest').forEach((tile) => {
        zones.push(buildFarmyardCardAnimalZone(CARD_ID, {
          capacity: 1,
          allowedAnimalType: null,
          farmPosition: tile,
        }))
      })
    },
    getInvalidAnimals: (_player, _zone, meeples) =>
      meeples.filter((meeple) => meeple.type === 'sheep'),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M034_HomeWood = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Home Wood",
    deck: "M",
    number: 34,
    category: "FARM_PLANNER",
    desc: [
        "You can keep exactly 1 animal, except <SHEEP>, on each farmyard space containing at least 1 <FOREST>."
    ],
    cost: {},
    prerequisite: "3 Improvements",
    animalHolder: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M034_HomeWood_impl = M034_HomeWood.impl

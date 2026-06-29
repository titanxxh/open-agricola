import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { buildCardAnimalZoneId } from '../../domain/animal-zones'
import { getFarmyardTilePositions, positionKey } from '../../domain/farm'
import { getUsedFarmyardTileKeys } from '../../domain/farmyard-usage'

const CARD_ID = 'M035_HorseTrough'

const isAdjacentToHouse = (
  tile: { row: number; col: number },
  roomTiles: readonly { row: number; col: number }[],
) => roomTiles.some((room) =>
  Math.abs(room.row - tile.row) + Math.abs(room.col - tile.col) === 1
)

const cardImpl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (player, zones, _state) => {
      const used = getUsedFarmyardTileKeys(player)
      getFarmyardTilePositions(player)
        .filter((tile) =>
          !used.has(positionKey(tile)) && isAdjacentToHouse(tile, player.roomTiles)
        )
        .forEach((tile) => {
          zones.push({
            id: buildCardAnimalZoneId(CARD_ID, tile),
            zoneType: 'card',
            cardId: CARD_ID,
            capacity: 2,
            animalType: 'horse',
            animalCount: 0,
            allowedAnimalType: 'horse',
            farmPosition: tile,
            countsFarmyardSpaceAsUnused: true,
            displaySource: 'farm-position',
            exclusiveCardZoneLimit: 1,
          })
        })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M035_HorseTrough = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Horse Trough",
    deck: "M",
    number: 35,
    category: "FARM_PLANNER",
    desc: [
        "You can keep up to 2 horses in an unused farmyard space adjacent to your house. Even if you do, this farmyard space is still considered unused. You can change in which farmyard space you keep the horses."
    ],
    cost: {
        "stone": 1
    },
    animalHolder: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M035_HorseTrough_impl = M035_HorseTrough.impl

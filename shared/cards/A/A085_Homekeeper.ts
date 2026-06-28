import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A085_Homekeeper'
const isAdjacent = (a: { row: number; col: number }, b: { row: number; col: number }) =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeExtraRoomCapacity: (player) => {
    if (player.houseType === 'wood') return 0

    const pastureTiles = player.pastures.flatMap((pasture) => pasture.tiles)
    const hasQualifyingRoom = player.roomTiles.some((roomTile) => {
      const adjacentToField = player.fields.some((field) => isAdjacent(roomTile, field))
      if (!adjacentToField) return false
      return pastureTiles.some((pastureTile) => isAdjacent(roomTile, pastureTile))
    })

    return hasQualifyingRoom ? 1 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A085_Homekeeper = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Homekeeper",
    deck: "A",
    number: 85,
    category: "FARM_PLANNER",
    desc: ["Exactly one clay or stone room in your house can hold an additional person if the room is adjacent to both a field and a pasture."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const A085_Homekeeper_impl = A085_Homekeeper.impl

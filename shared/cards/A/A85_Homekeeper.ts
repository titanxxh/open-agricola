import type { CardImpl } from '../registry'
import { A85_Homekeeper } from '../../cards-display/A/A85_Homekeeper'

const CARD_ID = A85_Homekeeper.id

const isAdjacent = (a: { row: number; col: number }, b: { row: number; col: number }) =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1

export const A85_Homekeeper_impl = {
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

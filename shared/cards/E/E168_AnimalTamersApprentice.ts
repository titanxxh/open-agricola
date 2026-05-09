import { gainLeaf } from '../helpers/pay-gain-node'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { E168_AnimalTamersApprentice } from '../../cards-display/E/E168_AnimalTamersApprentice'

const CARD_ID = E168_AnimalTamersApprentice.id

export const E168_AnimalTamersApprentice_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const roomCount = player.roomTiles.length
    // Occupied rooms = min(familySize, roomCount); unoccupied = rest
    const occupied = Math.max(0, familySize(player) - (player.houseAnimalCount ?? 0))
    const unoccupied = Math.max(0, roomCount - occupied)
    if (unoccupied <= 0) return

    if (player.houseType === 'wood') {
      return gainLeaf(CARD_ID, { sheep: unoccupied })
    }
    if (player.houseType === 'clay') {
      return gainLeaf(CARD_ID, { boar: unoccupied })
    }
    if (player.houseType === 'stone') {
      return gainLeaf(CARD_ID, { cattle: unoccupied })
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

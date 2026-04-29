import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { familySize } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'E168_AnimalTamersApprentice'

export const E168_AnimalTamersApprentice = new Occupation({
  id: CARD_ID,
  name: "Animal Tamer's Apprentice",
  deck: 'E',
  number: 168,
  category: 'ANIMALS_-_ALL',
  desc: ['At the start of each round, you get 1 <SHEEP>/<PIG>/<CATTLE> for each unoccupied wood/clay/stone room in your house.'],
  cost: {},
  players: '4+',
})

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

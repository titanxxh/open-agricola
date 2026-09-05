import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { familySize } from '../../domain/player'
import { getExtraRoomCapacity } from '../card-effects'
import type { CardImpl } from '../registry'

const CARD_ID = 'E168_AnimalTamersApprentice'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const roomCount = player.roomTiles.length
    const occupied = Math.max(0, familySize(player) - getExtraRoomCapacity(player))
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

export const E168_AnimalTamersApprentice = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Animal Tamer's Apprentice",
    deck: 'E',
    number: 168,
    category: 'ANIMALS_-_ALL',
    desc: ['At the start of each round, you get 1 <SHEEP>/<PIG>/<CATTLE> for each unoccupied <WOOD>/<CLAY>/stone room in your house.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const E168_AnimalTamersApprentice_impl = E168_AnimalTamersApprentice.impl

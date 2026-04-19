import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E11_PettingZoo'

const isAdjacent = (a: { row: number; col: number }, b: { row: number; col: number }) =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1

/**
 * E11 Petting Zoo — As long as you have a pasture orthogonally adjacent to
 * your house, you can keep animals of any type on this card, up to the
 * number of rooms in your house.
 */
registerCardEffect({
  id: CARD_ID,
  onComputeAnimalZones: (player, zones) => {
    const roomTiles = player.roomTiles ?? []
    const hasAdjacentPasture = player.pastures.some(p =>
      (p.tiles ?? []).some(pt =>
        roomTiles.some(rt => isAdjacent(pt, rt))
      )
    )
    if (!hasAdjacentPasture) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity: player.rooms,
      animalType: null,
      animalCount: 0,
    })
  },
})

export const E11_PettingZoo = new MinorImprovement({
  id: CARD_ID,
  name: 'Petting Zoo',
  deck: 'E',
  number: 11,
  category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
  desc: ['As long as you have a pasture orthogonally adjacent to your house, you can keep animals of any type on this card, up to the number of rooms in your house.'],
  cost: { wood: 1 },
})

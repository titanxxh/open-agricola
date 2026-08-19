import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E011_PettingZoo'
const isAdjacent = (a: { row: number; col: number }, b: { row: number; col: number }) =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1

const cardImpl = {
  effect: {
  id: CARD_ID,
  onComputeAnimalZones: (player, zones, _state) => {
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
      cardId: CARD_ID,
      capacity: player.rooms,
      animalType: null,
      animalCount: 0,
      allowedAnimalType: null,
    })
  },
  /**
   * The reference `Cards/E/the reference::getInvalidAnimals` returns []:
   * adjacency is enforced by gating zone registration in
   * onPlayerComputeDropZones. Mirror the reference exactly.
   */
  getInvalidAnimals: () => [],
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E011_PettingZoo = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Petting Zoo',
    deck: 'E',
    number: 11,
    category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
    desc: ['As long as you have a pasture orthogonally adjacent to your house, you can keep animals of any type on this card, up to the number of rooms in your house.'],
    cost: { wood: 1 },
    animalHolder: true,
  },
  impl: cardImpl,
})

export const E011_PettingZoo_impl = E011_PettingZoo.impl

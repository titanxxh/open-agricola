import type { CardImpl } from '../registry'
import { E11_PettingZoo } from '../../cards-display/E/E11_PettingZoo'

const CARD_ID = E11_PettingZoo.id

const isAdjacent = (a: { row: number; col: number }, b: { row: number; col: number }) =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1

export const E11_PettingZoo_impl = {
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
    })
  },
  /**
   * BGA `Cards/E/E11_PettingZoo.php::getInvalidAnimals` returns []:
   * adjacency is enforced by gating zone registration in
   * onPlayerComputeDropZones. Mirror BGA exactly.
   */
  getInvalidAnimals: () => [],
},
  reaches: [] as readonly string[],
} satisfies CardImpl

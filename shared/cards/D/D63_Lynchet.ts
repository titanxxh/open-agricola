import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D63_Lynchet'
/**
 * D63 Lynchet (Sprint 7a F7).
 *
 * BGA `Cards/D/D63_Lynchet.php::countFields($event)`:
 *   $fields = $player->board()->getHarvestedFieldTilePositions($event['crops']);
 *   foreach ($fields as $field) if (isAdjacentToType($field['x'], $field['y'], roomType)) $n++;
 *
 * The reap summary now exposes `harvestedPositions` (Sprint 7a F7) — exact tile
 * positions of every field that produced a crop this reap. We count those that
 * are orthogonally adjacent to any room tile.
 */
const isAdjacent = (a: { row: number; col: number }, b: { row: number; col: number }) =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1

const cardImpl = {
  effect: {
    id: CARD_ID,
    onAfterReap: (state, player) => {
      const summary = state.harvestReapSummary?.[player.id]
      const positions = summary?.harvestedPositions ?? []
      if (positions.length === 0) return

      const roomTiles = player.roomTiles ?? []
      if (roomTiles.length === 0) return

      let n = 0
      for (const pos of positions) {
        if (roomTiles.some((rt) => isAdjacent(pos, rt))) n += 1
      }
      if (n <= 0) return
      return gainLeaf(CARD_ID, { food: n })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D63_Lynchet = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Lynchet',
    deck: 'D',
    number: 63,
    category: 'FOOD_PROVIDER',
    desc: [
        'In the field phase of each harvest, you get 1 <FOOD> for each harvested field tile that is orthogonally adjacent to your house.',
      ],
    cost: {},
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const D63_Lynchet_impl = D63_Lynchet.impl

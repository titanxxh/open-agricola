import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { playerHasCardCapability } from '../helpers/card-type'
import { getFarmyardFields } from '../helpers/card-field'

const CARD_ID = 'B031_PotteryYard'

const cardImpl = {
  prerequisiteCheck: (player) =>
    playerHasCardCapability(player, 'potteryIdentity', { asType: 'major' }),
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {

    // Build a set of all used tile positions on the 3x5 farm board.
    const usedTiles = new Set<string>()
    player.roomTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    getFarmyardFields(player).forEach((field) => usedTiles.add(`${field.row},${field.col}`))
    player.stableTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.pastures.flatMap((p) => p.tiles ?? []).forEach((t) => usedTiles.add(`${t.row},${t.col}`))

    // Collect all free (unused) tile positions.
    const freeTiles: Array<{ row: number; col: number }> = []
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        if (!usedTiles.has(`${row},${col}`)) {
          freeTiles.push({ row, col })
        }
      }
    }

    // Award 2 bonus points if at least 2 free tiles are orthogonally adjacent to each other.
    const freeSet = new Set(freeTiles.map((t) => `${t.row},${t.col}`))
    for (const tile of freeTiles) {
      const neighbors = [
        { row: tile.row - 1, col: tile.col },
        { row: tile.row + 1, col: tile.col },
        { row: tile.row, col: tile.col - 1 },
        { row: tile.row, col: tile.col + 1 },
      ]
      for (const n of neighbors) {
        if (freeSet.has(`${n.row},${n.col}`)) {
          return 2
        }
      }
    }
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B031_PotteryYard = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Pottery Yard',
    deck: 'B',
    number: 31,
    category: 'POINTS_PROVIDER',
    desc: [
        'During the scoring, if there are at least 2 orthogonally adjacent unused spaces in your farm, you get 2 bonus <SCORE>. (You still get the negative points for those unused spaces.',
      ],
    cost: {},
    vp: 1,
    prerequisite: 'Pottery (or an Upgrade Thereof)',
    extraVp: true,
  },
  impl: cardImpl,
})

export const B031_PotteryYard_impl = B031_PotteryYard.impl

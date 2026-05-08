import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { B31_PotteryYard } from '../../cards-display/B/B31_PotteryYard'
export { B31_PotteryYard }

const CARD_ID = B31_PotteryYard.id

const POTTERY_IDS = ['Major_Pottery', 'D60_LargePottery']

registerPrerequisite('Pottery (or an Upgrade Thereof)', (player) => {
  const owned = new Set<string>([...player.improvements, ...player.minorPlayed])
  return POTTERY_IDS.some((id) => owned.has(id))
})

export const B31_PotteryYard_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {

    // Build a set of all used tile positions on the 3x5 farm board.
    const usedTiles = new Set<string>()
    player.roomTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.fields.forEach((f) => usedTiles.add(`${f.row},${f.col}`))
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

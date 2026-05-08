import type { CardImpl } from '../registry'
import { D33_SummerHouse } from '../../cards-display/D/D33_SummerHouse'

const CARD_ID = D33_SummerHouse.id

export const D33_SummerHouse_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (player.houseType !== 'stone') return 0
    const usedTiles = new Set<string>()
    player.roomTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.fields.forEach((f) => usedTiles.add(`${f.row},${f.col}`))
    player.stableTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.pastures.flatMap((p) => p.tiles ?? []).forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    let count = 0
    for (const room of player.roomTiles) {
      const neighbors = [
        { row: room.row - 1, col: room.col },
        { row: room.row + 1, col: room.col },
        { row: room.row, col: room.col - 1 },
        { row: room.row, col: room.col + 1 },
      ]
      for (const n of neighbors) {
        if (n.row < 0 || n.row > 2 || n.col < 0 || n.col > 4) continue
        const key = `${n.row},${n.col}`
        if (!usedTiles.has(key)) {
          usedTiles.add(key) // avoid double counting
          count++
        }
      }
    }
    return count * 2
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

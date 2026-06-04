import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'D33_SummerHouse'

const cardImpl = {
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

export const D33_SummerHouse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Summer House",
    deck: "D",
    number: 33,
    category: "POINTS_PROVIDER",
    desc: [
        'During scoring, if you live in a stone house, you get 2 bonus <SCORE> for each unused farmyard space orthogonally adjacent to your house. (You still lose the points for these unused spaces.)',
      ],
    cost: { wood: 3, stone: 1 },
    prerequisite: "Still in Wooden House",
    extraVp: true,
  },
  impl: cardImpl,
})

export const D33_SummerHouse_impl = D33_SummerHouse.impl

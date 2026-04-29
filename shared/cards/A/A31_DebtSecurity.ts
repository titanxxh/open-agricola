import { MinorImprovement } from '../types'
import { collectCardsAs } from '../helpers/card-type'
import type { CardImpl } from '../registry'

const CARD_ID = 'A31_DebtSecurity'

export const A31_DebtSecurity = new MinorImprovement({
  id: CARD_ID,
  name: "Debt Security",
  deck: "A",
  number: 31,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each major improvement you have, up to the number of your unused farmyard spaces."],
  cost: {},
  extraVp: true,
})

export const A31_DebtSecurity_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const usedTiles = new Set<string>()
    player.roomTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.fields.forEach((f) => usedTiles.add(`${f.row},${f.col}`))
    player.stableTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.pastures.flatMap((p) => p.tiles ?? []).forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    const unusedSpaces = 15 - usedTiles.size
    return Math.min(collectCardsAs(player, 'major').length, unusedSpaces)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

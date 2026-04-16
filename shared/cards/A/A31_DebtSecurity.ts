import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A31_DebtSecurity'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    const usedTiles = new Set<string>()
    player.roomTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.fields.forEach((f) => usedTiles.add(`${f.row},${f.col}`))
    player.stableTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.pastures.flatMap((p) => p.tiles ?? []).forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    const unusedSpaces = 15 - usedTiles.size
    return Math.min(player.improvements.length, unusedSpaces)
  },
})

export const A31_DebtSecurity = new MinorImprovement({
  id: CARD_ID,
  name: "Debt Security",
  deck: "A",
  number: 31,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each major improvement you have, up to the number of your unused farmyard spaces."],
  cost: {},
})

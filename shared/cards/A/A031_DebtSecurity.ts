import { defineMinorCard } from '../card-source'
import { collectCardsAs } from '../helpers/card-type'
import type { CardImpl } from '../registry'

const CARD_ID = 'A031_DebtSecurity'

const cardImpl = {
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

export const A031_DebtSecurity = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Debt Security",
    deck: "A",
    number: 31,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, you get 1 bonus <SCORE> for each major improvement you have, up to the number of your unused farmyard spaces."],
    cost: { food: 2 },
    extraVp: true,
  },
  impl: cardImpl,
})

export const A031_DebtSecurity_impl = A031_DebtSecurity.impl

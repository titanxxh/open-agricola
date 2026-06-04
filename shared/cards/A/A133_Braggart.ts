import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A133_Braggart'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const count = player.improvements.length + player.minorPlayed.length
    if (count >= 10) return 9
    if (count >= 9) return 7
    if (count >= 8) return 5
    if (count >= 7) return 4
    if (count >= 6) return 3
    if (count >= 5) return 2
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A133_Braggart = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Braggart",
    deck: "A",
    number: 133,
    category: "POINTS_PROVIDER",
    desc: ["During the scoring, you get 2/3/4/5/7/9 bonus <SCORE> for having at least 5/6/7/8/9/10 improvements in front of you."],
    cost: {},
    players: "3+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const A133_Braggart_impl = A133_Braggart.impl

import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A99_FellowGrazer'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return player.pastures.filter((p) => p.size >= 3).length * 2
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A99_FellowGrazer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Fellow Grazer",
    deck: "A",
    number: 99,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, you get 2 bonus <SCORE> for each pasture you have covering at least 3 farmyard spaces."],
    cost: {},
    players: "1+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const A99_FellowGrazer_impl = A99_FellowGrazer.impl

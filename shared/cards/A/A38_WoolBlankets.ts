import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A38_WoolBlankets'

export const A38_WoolBlankets = new MinorImprovement({
  id: CARD_ID,
  name: "Wool Blankets",
  deck: "A",
  number: 38,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, if you live in a wooden/clay/stone house by then, you get 3/2/0 bonus <SCORE>."],
  cost: {},
  prerequisite: "Wooden House",
  extraVp: true,
})

export const A38_WoolBlankets_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (player.houseType === 'wood') return 3
    if (player.houseType === 'clay') return 2
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

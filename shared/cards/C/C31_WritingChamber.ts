import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C31_WritingChamber'

export const C31_WritingChamber = new MinorImprovement({
  id: CARD_ID,
  name: "Writing Chamber",
  deck: "C",
  number: 31,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get a number of bonus <SCORE> equal to the total of negative points you have, to a maximum of 7 <SCORE>."],
  cost: {"wood":2},
})

export const C31_WritingChamber_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, _player, ctx) => {
    const negativeTotal = (ctx.categories ?? []).reduce((sum, cat) => sum + Math.min(0, cat.total), 0)
    return Math.min(7, Math.abs(negativeTotal))
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

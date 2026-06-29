import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C031_WritingChamber'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, _player, ctx) => {
    const negativeTotal = (ctx.categories ?? []).reduce((sum, cat) => sum + Math.min(0, cat.total), 0)
    return Math.min(7, Math.abs(negativeTotal))
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C031_WritingChamber = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Writing Chamber",
    deck: "C",
    number: 31,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, you get a number of bonus <SCORE> equal to the total of negative points you have, to a maximum of 7 <SCORE>."],
    cost: {"wood":2},
    extraVp: true,
  },
  impl: cardImpl,
})

export const C031_WritingChamber_impl = C031_WritingChamber.impl

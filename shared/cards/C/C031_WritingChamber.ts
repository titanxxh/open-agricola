import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { getOrdinaryNegativeScoreTotal } from '../../domain/score-rules'

const CARD_ID = 'C031_WritingChamber'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeSharedPostScore: (_state, player, summaries) => {
    const summary = summaries.find((summary) => summary.playerId === player.id)
    const negativeTotal = summary ? getOrdinaryNegativeScoreTotal(summary) : 0
    return [{ playerId: player.id, score: Math.min(7, -negativeTotal) }]
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

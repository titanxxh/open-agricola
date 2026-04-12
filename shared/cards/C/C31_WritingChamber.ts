import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C31_WritingChamber'

registerCardEffect({
  id: CARD_ID,
  computePostScore: (_state, player, categories) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    const negativeTotal = categories.reduce((sum, cat) => sum + Math.min(0, cat.total), 0)
    return Math.min(7, Math.abs(negativeTotal))
  },
})

export const C31_WritingChamber = new MinorImprovement({
  id: CARD_ID,
  name: "Writing Chamber",
  deck: "C",
  number: 31,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get a number of bonus <SCORE> equal to the total of negative points you have, to a maximum of 7 <SCORE>."],
  cost: {"wood":2},
})

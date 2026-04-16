import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C33_GreeningPlan'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    const emptyFields = player.fields.filter((f) => !f.crop || f.remaining === 0).length
    if (emptyFields >= 6) return 5
    if (emptyFields >= 5) return 3
    if (emptyFields >= 4) return 2
    if (emptyFields >= 2) return 1
    return 0
  },
})

export const C33_GreeningPlan = new MinorImprovement({
  id: CARD_ID,
  name: "Greening Plan",
  deck: "C",
  number: 33,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, if you then have at least 2/4/5/6 unplanted fields, you get 1/2/3/5 bonus <SCORE>."],
  cost: {},
})

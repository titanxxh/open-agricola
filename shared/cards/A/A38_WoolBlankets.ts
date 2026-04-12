import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A38_WoolBlankets'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    if (player.houseType === 'wood') return 3
    if (player.houseType === 'clay') return 2
    return 0
  },
})

export const A38_WoolBlankets = new MinorImprovement({
  id: CARD_ID,
  name: "Wool Blankets",
  deck: "A",
  number: 38,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 3/2/0 bonus <SCORE> if you have a wooden/clay/stone house."],
  cost: { wood: 1, sheep: 1 },
  prerequisite: "Wooden House",
})

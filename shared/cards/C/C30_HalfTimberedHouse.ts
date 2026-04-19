import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { getStoneHouseBonusScore } from '../helpers/stone-house-bonus'

const CARD_ID = 'C30_HalfTimberedHouse'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return getStoneHouseBonusScore(player, CARD_ID)
  },
})

export const C30_HalfTimberedHouse = new MinorImprovement({
  id: CARD_ID,
  name: "Half-Timbered House",
  deck: "C",
  number: 30,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each stone room you have. You can only use one card to get bonus points for your stone house."],
  cost: { wood: 2, clay: 2, reed: 1 },
  prerequisite: "Stone House",
})

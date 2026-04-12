import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C30_HalfTimberedHouse'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    return player.houseType === 'stone' ? player.rooms : 0
  },
})

export const C30_HalfTimberedHouse = new MinorImprovement({
  id: CARD_ID,
  name: "Half-Timbered House",
  deck: "C",
  number: 30,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> per room if you have a stone house."],
  cost: { wood: 2, clay: 2, reed: 1 },
  prerequisite: "Stone House",
})

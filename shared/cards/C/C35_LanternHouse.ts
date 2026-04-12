import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C35_LanternHouse'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    return -(player.minorHand.length + player.occupationHand.length)
  },
})

export const C35_LanternHouse = new MinorImprovement({
  id: CARD_ID,
  name: "Lantern House",
  deck: "C",
  number: 35,
  category: "POINTS_PROVIDER",
  desc: ["This card is worth 3 <SCORE>, but you lose 1 <SCORE> for each card remaining in your hand at the end of the game."],
  cost: { clay: 1 },
  vp: 3,
})
